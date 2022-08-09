import type { Server, Passthrough } from '../types'
import http, { IncomingMessage, ServerResponse } from 'http';
import https from 'https';
import { Buffer } from 'buffer'
import { Duplex } from 'stream';
import EventEmitter from 'eventemitter3';
import * as webIncoming from './passes/web.incoming';
import * as wsIncoming from './passes/ws.incoming';

export class ProxyServer extends EventEmitter {
    options: Server.ServerOptions;
    $server: http.Server | undefined;

    webPasses: Passthrough[];
    wsPasses: Passthrough[];

    web: Passthrough;
    ws: Passthrough;

    static createProxyServer: (options: Server.ServerOptions) => ProxyServer
    static createServer: (options: Server.ServerOptions) => ProxyServer
    static createProxy: (options: Server.ServerOptions) => ProxyServer

    /**
     * Creates the proxy server with specified options.
     * @param options - Config object passed to the proxy
     */
    constructor(options: Server.ServerOptions = {}) {
        super();

        options.prependPath = options.prependPath === false ? false : true;

        this.web = createRightProxy('web')(options);
        this.ws = createRightProxy('ws')(options);
        this.options = options;

        this.webPasses = Object.keys(webIncoming).map(function (pass) {
            return webIncoming[pass] as Passthrough;
        });

        this.wsPasses = Object.keys(wsIncoming).map(function (pass) {
            return wsIncoming[pass] as Passthrough;
        });;

        super.on('error', this.onError, this);
    }

    onError(err: Error) {
        if (super.listeners('error').length === 1) {
            throw err;
        }
    }

    listen(port: number, hostname: string) {
        const closure = (req: IncomingMessage, res: ServerResponse) => {
            this.web(req, res);
        };

        this.$server = this.options.ssl ? https.createServer(this.options.ssl, closure) : http.createServer(closure);

        if (this.options.ws) {
            this.$server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
                this.ws(req, socket, head);
            });
        }

        this.$server.listen(port, hostname);

        return this;
    }

    close(callback?: () => void) {
        if (this.$server) {
            this.$server.close(() => {
                this.$server = undefined;
                if (callback) {
                    callback.apply(null, arguments);
                }
            });
        }
    }

    before(type: 'web' | 'ws', passName: string, callback: Passthrough) {
        const passes = (type === 'ws') ? this.wsPasses : this.webPasses;
        let i = -1;

        passes.forEach(function (v, idx) {
            if (v.name === passName) i = idx;
        })

        if (i === -1) throw new Error('No such pass');

        passes.splice(i, 0, callback);
    }

    after(type: 'web' | 'ws', passName: string, callback: Passthrough) {
        const passes = (type === 'ws') ? this.wsPasses : this.webPasses;
        let i = -1;

        passes.forEach(function (v, idx) {
            if (v.name === passName) i = idx;
        })

        if (i === -1) throw new Error('No such pass');

        passes.splice(i++, 0, callback);
    }
}

/**
 * Returns a function that creates the loader for
 * either `ws` or `web`'s  passes.
 *
 * Examples:
 *
 *    httpProxy.createRightProxy('ws')
 *    // => [Function]
 *
 * @param { string } type Either 'ws' or 'web'
 * 
 * @return { Function } Loader Function that when called returns an iterator for the right passes
 *
 * @api private
 */
function createRightProxy(type: 'web' | 'ws'): (options: Server.ServerOptions) => Passthrough {
    return function (options: Server.ServerOptions) {
        return function (req: IncomingMessage, res: ServerResponse | Duplex) {
            const passes = (type === 'ws') ? this.wsPasses : this.webPasses;
            let args = [].slice.call(arguments);
            let cntr = args.length - 1;
            let head;
            let callback;

            /* optional args parse begin */
            if (typeof args[cntr] === 'function') {
                callback = args[cntr];

                cntr--;
            }

            let requestOptions = options;
            if (!(args[cntr] instanceof Buffer) && args[cntr] !== res) {

                //Copy global options
                requestOptions = Object.assign({}, options);
                //Overwrite with request options
                Object.assign(requestOptions, args[cntr]);

                cntr--;
            }

            if (args[cntr] instanceof Buffer) {
                head = args[cntr];
            }

            /* optional args parse end */

            ['target', 'forward'].forEach(function (e) {
                if (typeof requestOptions[e] === 'string') {
                    requestOptions[e] = new URL(requestOptions[e]);
                }
            });

            if (!requestOptions.target && !requestOptions.forward) {
                return this.emit('error', new Error('Must provide a proper URL as target'));
            }

            for (let i = 0; i < passes.length; i++) {
                if (passes[i](req, res, requestOptions, head, this, callback)) {
                    break;
                }
            }
        }
    }
}

/**
 * Creates the proxy server.
 *
 * Examples:
 *
 *    httpProxy.createProxyServer({ .. }, 8000)
 *    // => '{ web: [Function], ws: [Function] ... }'
 *
 * @param { Server.ServerOptions } options Config object passed to the proxy
 *
 * @return { ProxyServer } Proxy server
 * 
 * @api public
 */
export function createProxyServer(options: Server.ServerOptions): ProxyServer {
    return new ProxyServer(options);
}

export const createServer = createProxyServer;
export const createProxy = createProxyServer;