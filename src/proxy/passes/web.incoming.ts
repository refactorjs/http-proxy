import type { ProxyTargetDetailed, Server } from '../../types'
import type { ProxyServer } from '../'
import type { Socket } from 'net';
import { hasEncryptedConnection, getPort, isSSL, setupOutgoing } from '../common';
import { pipeline } from 'stream';
import httpNative, { IncomingMessage, ServerResponse } from 'http';
import httpsNative from 'https';
import followRedirects from 'follow-redirects';
import * as webOutgoing from './web.outgoing';
import { URL } from 'url';

const passes = Object.keys(webOutgoing).map(pass => webOutgoing[pass as keyof typeof webOutgoing]);
const nativeAgents = { http: httpNative, https: httpsNative };

/**
 * Sets `content-length` to '0' if request is of DELETE type.
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { Server.ServerOptions } options Config object passed to the proxy
 *
 * @api private
 */
export function deleteLength(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions): void | boolean {
    if ((req.method === 'DELETE' || req.method === 'OPTIONS') && !req.headers['content-length']) {
        req.headers['content-length'] = '0';
        delete req.headers['transfer-encoding'];
    }
}

/**
 * Sets timeout in request socket if it was specified in options.
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { Server.ServerOptions } options Config object passed to the proxy
 *
 * @api private
 */
export function timeout(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions): void | boolean {
    let timeoutValue = (options.timeout ? options.timeout : 0);
    req.socket.setTimeout(timeoutValue);
}

/**
 * Sets `x-forwarded-*` headers if specified in config.
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { Server.ServerOptions } options Config object passed to the proxy
 *
 * @api private
 */
export function XHeaders(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions): void | boolean {
    if (!options.xfwd) return;

    let encrypted = hasEncryptedConnection(req);
    let values: Record<string, string | string[] | undefined> = {
        for: req.socket?.remoteAddress,
        port: getPort(req),
        proto: encrypted ? 'https' : 'http'
    };

    for (let header of ['for', 'port', 'proto']) {
        const headerName = 'x-forwarded-' + header;
        if (!req.headers[headerName]) {
            req.headers[headerName] = values[header];
        }
    }

    req.headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers['host'] || '';
}

/**
 * Does the actual proxying. If `forward` is enabled fires up
 * a ForwardStream, same happens for ProxyStream. The request
 * just dies otherwise.
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { Server.ServerOptions } options Config object passed to the proxy
 * @param { ProxyServer } server Server object
 *
 * @api private
 */
export function stream(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions, server: ProxyServer, callback: (err: Error, req: IncomingMessage, res: ServerResponse, url: Server.ServerOptions['target']) => void): void | ServerResponse {
    // And we begin!
    server.emit('start', req, res, options.target || options.forward);

    const agents = options.followRedirects ? followRedirects : nativeAgents;
    const http = agents.http;
    const https = agents.https;

    if (options.forward) {
        // If forward enable, so just pipe the request
        const forwardReq: httpNative.ClientRequest = (isSSL.test(options.forward!['protocol' as keyof Server.ServerOptions['target']]) ? https : http)
        // @ts-ignore - Incompatibilities with follow-redirects types
        .request(setupOutgoing(options.ssl || {}, options, req, 'forward'));

        // error handler (e.g. ECONNRESET, ECONNREFUSED)
        // Handle errors on incoming request as well as it makes sense to
        const forwardError = createErrorHandler(forwardReq, options.forward);
        req.on('error', forwardError);
        forwardReq.on('error', forwardError);

        pipeline(options.buffer || req, forwardReq, () => { })

        if (!options.target) {
            return res.end();
        }
    }

    // Request initalization

    const proxyReq: httpNative.ClientRequest = (isSSL.test(options.target!['protocol' as keyof Server.ServerOptions['target']]) ? https : http)
    // @ts-ignore - Incompatibilities with follow-redirects types
    .request(setupOutgoing(options.ssl || {}, options, req));

    // Enable developers to modify the proxyReq before headers are sent
    proxyReq.on('socket', function (socket: Socket) {
        if (server && !proxyReq.getHeader('expect')) {
            server.emit('proxyReq', proxyReq, req, res, options);
        }
    });

    // allow outgoing socket to timeout so that we could
    // show an error page at the initial request
    if (options.proxyTimeout) {
        proxyReq.setTimeout(options.proxyTimeout, function () {
            proxyReq.destroy();
        });
    }

    // Ensure we abort proxy if request is aborted
    req.on('aborted', function () {
        proxyReq.destroy();
    });

    res.on('close', function () {
        if (res.destroyed) {
            proxyReq.destroy();
        }
    });

    // handle errors in proxy and incoming request, just like for forward proxy
    const proxyError = createErrorHandler(proxyReq, options.target);

    proxyReq.on('error', proxyError);
    req.on('error', proxyError);

    function createErrorHandler(proxyReq: httpNative.ClientRequest, url: string | Partial<URL & ProxyTargetDetailed> | undefined) {
        return function proxyError(err: any) {
            if (req.socket.destroyed && err.code === 'ECONNRESET') {
                server.emit('econnreset', err, req, res, url);
                proxyReq.destroy();
                return;
            }

            if (callback) {
                callback(err, req, res, url);
            } else {
                server.emit('error', err, req, res, url);
            }
        }
    }

    pipeline(options.buffer || req, proxyReq, () => { });

    proxyReq.on('response', function (proxyRes: IncomingMessage) {
        if (server) {
            server.emit('proxyRes', proxyRes, req, res, options);
        }

        const selfHandle = typeof (options.selfHandleResponse) === 'function' ? options.selfHandleResponse(proxyRes, req, res) : options.selfHandleResponse;

        if (!res.headersSent && (!selfHandle || options.forcePasses)) {
            for (let i = 0; i < passes.length; i++) {
                if (typeof passes[i] === 'function' && passes[i](req, res, proxyRes, options)) {
                    break;
                }
            }
        }

        if (!res.writableEnded) {
            // Allow us to listen when the proxy has completed
            proxyRes.on('end', function () {
                if (server) {
                    server.emit('end', req, res, proxyRes);
                }
            });
            // We pipe to the response unless its expected to be handled by the user
            if (!selfHandle) {
                pipeline(proxyRes, res, () => { });
            }
        } else {
            if (server) {
                server.emit('end', req, res, proxyRes);
            }
        }
    });
}