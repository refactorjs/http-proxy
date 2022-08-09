import type { Server } from '../../types'
import type { ProxyServer } from '../'
import type { Buffer } from 'buffer';
import * as common from '../common';
import { pipeline } from 'stream';
import http, { IncomingMessage, ServerResponse } from 'http';
import https from 'http';
import followRedirects from 'follow-redirects';

const nativeAgents = { http: http, https: https };

// 'aborted' event stopped working reliably on v15.5.0 and was later removed entirely
const hasAbortedEvent = (function () {
    var ver = process.versions.node.split('.').map(Number);
    return ver[0] <= 14 || ver[0] === 15 && ver[1] <= 4;
}());

/**
 * Sets `content-length` to '0' if request is of DELETE type.
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { Server.ServerOptions } options Config object passed to the proxy
 *
 * @api private
 */
export function deleteLength(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions): void {
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
export function timeout(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions): void {
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
export function XHeaders(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions): void {
    if (!options.xfwd) return;

    // @ts-ignore - Spdy is not exported in the types file
    let encrypted = req.isSpdy || common.hasEncryptedConnection(req);
    let values = {
        for: req.connection.remoteAddress || req.socket.remoteAddress,
        port: common.getPort(req),
        proto: encrypted ? 'https' : 'http'
    };

    ['for', 'port', 'proto'].forEach(function (header) {
        req.headers['x-forwarded-' + header] = (req.headers['x-forwarded-' + header] || '') + (req.headers['x-forwarded-' + header] ? ',' : '') + values[header];
    });

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
 * @param { Buffer } head Buffer containing the first bytes of the incoming request
 * @param { ProxyServer } server Server object
 *
 * @api private
 */
export function stream(req: IncomingMessage, res: ServerResponse, options: Server.ServerOptions, head: Buffer, server: ProxyServer, callback: ( err: Error, req: IncomingMessage, res: ServerResponse, url: Server.ServerOptions['target']) => void): void | ServerResponse {

    // And we begin!
    server.emit('start', req, res, options.target || options.forward);

    const agents = options.followRedirects ? followRedirects : nativeAgents;
    const http = agents.http;
    const https = agents.https;

    if (options.forward) {
        // If forward enable, so just pipe the request
        const forwardReq = (common.isSSL.test(options.forward.protocol) ? https : http).request(
            common.setupOutgoing(options.ssl || {}, options, req, 'forward')
        );

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
    const proxyReq = (common.isSSL.test(options.target.protocol) ? https : http).request(
        common.setupOutgoing(options.ssl || {}, options, req)
    );

    // Enable developers to modify the proxyReq before headers are sent
    proxyReq.on('socket', function (socket) {
        if (server && !proxyReq.getHeader('expect')) {
            server.emit('proxyReq', proxyReq, req, res, options);
        }
    });

    // allow outgoing socket to timeout so that we could
    // show an error page at the initial request
    if (options.proxyTimeout) {
        proxyReq.setTimeout(options.proxyTimeout, function () {
            proxyReq.abort();
        });
    }

    // Ensure we abort proxy if request is aborted
    if (hasAbortedEvent) {
        req.on('aborted', function () {
            proxyReq.abort();
        });
    } else {
        res.on('close', function () {
            var aborted = !res.writableFinished;
            if (aborted) {
                proxyReq.abort();
            }
        });
    }

    // handle errors in proxy and incoming request, just like for forward proxy
    const proxyError = createErrorHandler(proxyReq, options.target);

    proxyReq.on('error', proxyError);
    req.on('error', proxyError);

    function createErrorHandler(proxyReq, url) {
        return function proxyError(err) {
            if ((req.aborted || req.socket.destroyed) && err.code === 'ECONNRESET') {
                server.emit('econnreset', err, req, res, url);
                return proxyReq.abort();
            }

            if (callback) {
                callback(err, req, res, url);
            } else {
                server.emit('error', err, req, res, url);
            }
        }
    }

    pipeline(options.buffer || req, proxyReq, () => { });

    proxyReq.on('response', function (proxyRes) {
        proxyRes.abort = function () {
            proxyRes.aborted = true;
            proxyReq.abort();
            proxyRes.abort = function () { };
        };

        if (server) {
            server.emit('proxyRes', proxyRes, req, res, options);
        }

        const selfHandle = typeof (options.selfHandleResponse) === 'function' ? options.selfHandleResponse(proxyRes, req, res) : options.selfHandleResponse;

        if (!proxyRes.aborted) {
            if (!res.headersSent && (!selfHandle || options.forcePasses)) {
                common.runWebOutgoingPasses(req, res, proxyRes, options);
            }

            if (!res.finished) {
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
        }
    });
}