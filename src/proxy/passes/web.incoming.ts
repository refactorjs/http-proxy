import type { Server, OutgoingOptions } from '../../types';
import type { ProxyServer } from '../';
import type { Socket } from 'node:net';
import { hasEncryptedConnection, getPort, isSSL, setupOutgoing } from '../common';
import httpNative, { IncomingMessage, ServerResponse } from 'node:http';
import httpsNative, { RequestOptions } from 'node:https';
import * as webOutgoing from './web.outgoing';

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

    const encrypted = hasEncryptedConnection(req);
    const values: Record<string, string | string[] | undefined> = {
        For: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        Port: getPort(req),
        Proto: encrypted ? 'https' : 'http'
    };

    for (const header of ['For', 'Port', 'Proto']) {
        const headerName = 'X-Forwarded-' + header;
        if (req.headers?.[headerName]) {
            req.headers[headerName] += `, ${values[header]}`;
        } else {
            req.headers[headerName] = values[header];
        }
    }

    req.headers['X-Forwarded-Host'] = req.headers['X-Forwarded-Host'] || req.headers.host || '';
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
export function stream(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions, server: ProxyServer, callback: Server.ErrorCallback): void | ServerResponse {
    // And we begin!
    server.emit('start', req, res, options.target || options.forward);

    const http = nativeAgents.http;
    const https = nativeAgents.https;

    if (options.forward) {
        // If forward enable, so just pipe the request
        const forwardReq = (isSSL.test(options.forward!['protocol' as keyof Server.ServerOptions['target']]) ? https : http).request(setupOutgoing((options.ssl || {}) as OutgoingOptions, options as OutgoingOptions, req, 'forward') as RequestOptions);

        // error handler (e.g. ECONNRESET, ECONNREFUSED)
        // Handle errors on incoming request as well as it makes sense to
        const forwardError = createErrorHandler(forwardReq, options.forward);
        req.on('error', forwardError);
        forwardReq.on('error', forwardError);

        (options.buffer || req).pipe(forwardReq);

        if (!options.target) {
            return res.end();
        }
    }

    // Request initalization
    const proxyReq = (isSSL.test(options.target!['protocol' as keyof Server.ServerOptions['target']]) ? https : http).request(setupOutgoing((options.ssl || {}) as OutgoingOptions, options as OutgoingOptions, req) as RequestOptions);

    // Enable developers to modify the proxyReq before headers are sent
    proxyReq.on('socket', function (socket: Socket) {
        if (socket.pending) {
            // if not connected, wait till connect to pipe
            socket.on('connect', () => (options.buffer || req).pipe(proxyReq));
        }
        else {
            // socket is connected (reused?), just pipe
            (options.buffer || req).pipe(proxyReq);
        }

        if (server && !proxyReq.getHeader('expect')) {
            server.emit('proxyReq', proxyReq, req, res, options);
        }
    });

    // allow outgoing socket to timeout so that we could
    // show an error page at the initial request
    if (options.proxyTimeout) {
        proxyReq.setTimeout(options.proxyTimeout, function () {
            if (options.proxyTimeoutCustomError) {
                let timeoutError = new Error('The proxy request timed out');
                // @ts-ignore - NodeJs does not export code
                timeoutError.code = 'ETIMEDOUT';
                return proxyReq.destroy(timeoutError);
            }
            proxyReq.destroy();
        });
    }

    // Ensure we abort proxy if request is aborted
    res.on('close', function () {
        if (req.destroyed || !res.writableFinished) {
            proxyReq.destroy();
        }
    });

    // handle errors in proxy and incoming request, just like for forward proxy
    const proxyError = createErrorHandler(proxyReq, options.target);

    proxyReq.on('error', proxyError);
    req.on('error', proxyError);

    function createErrorHandler(proxyReq: httpNative.ClientRequest, target: Server.ServerOptions['target']) {
        return function proxyError(err: any) {
            if (req.socket?.destroyed && err.code === 'ECONNRESET') {
                server.emit('econnreset', err, req, res, target);
                proxyReq.destroy();
                return;
            }

            if (callback) {
                callback(err, req, res, target);
            } else {
                server.emit('error', err, req, res, target);
            }
        }
    }

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
                proxyRes.pipe(res);
            }
        } else {
            if (server) {
                server.emit('end', req, res, proxyRes);
            }
        }
    });
}