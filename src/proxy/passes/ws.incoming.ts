import type { Server } from '../../types'
import type { ProxyServer } from '../'
import type { Buffer } from 'buffer';
import type { Socket } from 'net';
import http, { ClientRequest, IncomingMessage, IncomingHttpHeaders } from 'http';
import https from 'https';
import { getPort, hasEncryptedConnection, isSSL, setupOutgoing, setupSocket } from '../common';

/**
 * WebSocket requests must have the `GET` method and
 * the `upgrade:websocket` header
 *
 * @param { IncomingMessage } req Request object
 * @param { Socket } socket Socket object
 *
 * @api private
 */
export function checkMethodAndHeader(req: IncomingMessage, socket: Socket): void | boolean {
    if (req.method !== 'GET' || !req.headers.upgrade) {
        socket.destroy();
        return true;
    }

    if (req.headers.upgrade.toLowerCase() !== 'websocket') {
        socket.destroy();
        return true;
    }
}

/**
 * Sets `x-forwarded-*` headers if specified in config.
 *
 * @param { IncomingMessage } req Request object
 * @param { Socket } socket Socket object
 * @param { Server.ServerOptions } options Config object passed to the proxy
 *
 * @api private
 */

export function XHeaders(req: IncomingMessage, socket: Socket, options: Server.ServerOptions): void {
    if (!options.xfwd) return;

    let values = {
        for: req.connection.remoteAddress || req.socket.remoteAddress,
        port: getPort(req),
        proto: hasEncryptedConnection(req) ? 'wss' : 'ws'
    };

    ['for', 'port', 'proto'].forEach(function (header) {
        req.headers['x-forwarded-' + header] = (req.headers['x-forwarded-' + header] || '') + (req.headers['x-forwarded-' + header] ? ',' : '') + values[header];
    });
}

/**
 * Does the actual proxying. Make the request and upgrade it
 * send the Switching Protocols request and pipe the sockets.
 *
 * @param { IncomingMessage } req Request object
 * @param { Socket } socket Socket object
 * @param { Server.ServerOptions } options Config object passed to the proxy
 * @param { Buffer } head Buffer containing the first bytes of the incoming request
 * @param { ProxyServer } server Server object
 *
 * @api private
 */
export async function stream(req: IncomingMessage, socket: Socket, options: Server.ServerOptions, head: Buffer, server: ProxyServer, callback: (err: Error, req: IncomingMessage, socket: Socket) => void): Promise<void | boolean | ClientRequest> {
    let createHttpHeader = function (line: string, headers: IncomingHttpHeaders): string {
        return Object.keys(headers).reduce(function (head, key) {
            let value = headers[key];

            if (!Array.isArray(value)) {
                head.push(key + ': ' + value);
                return head;
            }

            for (let i = 0; i < value.length; i++) {
                head.push(key + ': ' + value[i]);
            }
            return head;
        }, [line]).join('\r\n') + '\r\n\r\n';
    }

    setupSocket(socket);

    if (head && head.length) {
        socket.unshift(head);
    }

    // @ts-ignore
    let proxyReq = (isSSL.test(options.target.protocol) ? https : http).request(setupOutgoing(options.ssl || {}, options, req));

    // Error Handler
    proxyReq.on('error', onOutgoingError);
    proxyReq.on('response', function (res: IncomingMessage) {
        // if upgrade event isn't going to happen, close the socket

        // @ts-ignore
        // IncomingMessage type also passes through the response event
        if (!res.upgrade && !socket.destroyed) {
            socket.write(createHttpHeader('HTTP/' + res.httpVersion + ' ' + res.statusCode + ' ' + res.statusMessage, res.headers));
            res.pipe(socket).on('error', onOutgoingError)
        }
    });

    proxyReq.on('upgrade', function (proxyRes: IncomingMessage, proxySocket: Socket, proxyHead: Buffer) {
        proxySocket.on('error', onOutgoingError);

        // Allow us to listen when the websocket has completed
        proxySocket.on('end', function () {
            server.emit('close', proxyRes, proxySocket, proxyHead);
        });

        // The pipe below will end proxySocket if socket closes cleanly, but not
        // if it errors (eg, vanishes from the net and starts returning
        // EHOSTUNREACH). We need to do that explicitly.
        socket.on('error', function () {
            proxySocket.end();
        });

        setupSocket(proxySocket);

        if (proxyHead && proxyHead.length) {
            proxySocket.unshift(proxyHead);
        }

        //
        // Remark: Handle writing the headers to the socket when switching protocols
        // Also handles when a header is an array
        //
        if (!req.headers['x-method-ori']) {
            // if only not switch request method, like from connect to websocket
            socket.write('HTTP/1.1 101 Switching Protocols\r\n');
            socket.write(Object.keys(proxyRes.headers).map(function (i) {
                return i + ": " + proxyRes.headers[i];
            }).join('\r\n') + '\r\n\r\n');
        }

        let proxyStream = proxySocket;

        if (options.createWsServerTransformStream) {
            const wsServerTransformStream = options.createWsServerTransformStream(
                req,
                proxyReq,
                proxyRes,
            );

            wsServerTransformStream.on('error', onOutgoingError);
            proxyStream = proxyStream.pipe(wsServerTransformStream);
        }

        proxyStream = proxyStream.pipe(socket);

        if (options.createWsClientTransformStream) {
            const wsClientTransformStream = options.createWsClientTransformStream(
                req,
                proxyReq,
                proxyRes,
            );

            wsClientTransformStream.on('error', onOutgoingError);
            proxyStream = proxyStream.pipe(wsClientTransformStream);
        }

        proxyStream.pipe(proxySocket);

        server.emit('open', proxySocket);
        server.emit('proxySocket', proxySocket);  //DEPRECATED.
    });


    // Enable developers to modify the proxyReq before headers are sent
    if (server) {
        // Provides a way for the event handler to communicate back to the emitter when it finishes its async handling
        let asyncHandler
        const asyncContext = (callback) => {
            asyncHandler = callback
        }

        server.emit('proxyReqWs', proxyReq, req, socket, options, head, asyncContext);

        if (asyncHandler) {
            await asyncHandler()
        }
    }

    return proxyReq.end();

    function onOutgoingError(err: Error) {
        if (callback) {
            callback(err, req, socket);
        } else {
            server.emit('error', err, req, socket);
        }
        socket.end();
    }
}