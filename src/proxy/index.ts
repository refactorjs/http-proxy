import type { Server } from '../types'
import { Buffer } from 'buffer'
import EventEmitter from 'eventemitter3';
import http from 'http';
import https from 'https';
import { webIncoming } from './passes/web.incoming';
import { wsIncoming } from './passes/ws.incoming';

const webPasses = Object.keys(webIncoming).map(function (pass) {
    return webIncoming[pass];
});

const wsPasses = Object.keys(wsIncoming).map(function (pass) {
    return wsIncoming[pass];
});

export default class ProxyServer extends EventEmitter {
    options: Server.ServerOptions;
    $server: http.Server | https.Server | undefined;
    web: any;
    ws: any;
    proxyRequest: any;
    proxyWebsocketRequest: any;
    webPasses: Array<Function>;
    wsPasses: Array<Function>;

    static createProxyServer: (options: Server.ServerOptions) => ProxyServer
    static createServer: (options: Server.ServerOptions) => ProxyServer
    static createProxy: (options: Server.ServerOptions) => ProxyServer

    /**
     * Creates the proxy server with specified options.
     * @param options - Config object passed to the proxy
     */
    constructor(options: Server.ServerOptions) {
        super();

        options = options || {};
        options.prependPath = options.prependPath === false ? false : true;

        this.web = this.proxyRequest = createRightProxy('web')(options);
        this.ws = this.proxyWebsocketRequest = createRightProxy('ws')(options);
        this.options = options;

        this.webPasses = webPasses;

        this.wsPasses = wsPasses;

        super.on('error', this.onError, this);
    }

    onError(err) {
        if (super.listeners('error').length === 1) {
            throw err;
        }
    }

    listen(port, hostname) {
        const closure = (req, res) => {
            this.web(req, res);
        };

        this.$server = this.options.ssl ? https.createServer(this.options.ssl, closure) : http.createServer(closure);

        if (this.options.ws) {
            this.$server.on('upgrade', (req, socket, head) => {
                this.ws(req, socket, head);
            });
        }

        this.$server.listen(port, hostname);

        return this;
    }

    close(callback) {
        if (this.$server) {
            this.$server.close(done);
        }

        // Wrap callback to nullify server after all open connections are closed.
        function done() {
            this.$server = null;
            if (callback) {
                callback.apply(null, arguments);
            }
        };
    }

    before(type, passName, callback) {
        if (type !== 'ws' && type !== 'web') {
            throw new Error('type must be `web` or `ws`');
        }

        const passes = (type === 'ws') ? this.wsPasses : this.webPasses;
        let i: false | number = false;

        passes.forEach(function (v, idx) {
            if (v.name === passName) i = idx;
        })

        if (i === false) throw new Error('No such pass');

        passes.splice(i, 0, callback);
    }

    after(type, passName, callback) {
        if (type !== 'ws' && type !== 'web') {
            throw new Error('type must be `web` or `ws`');
        }

        const passes = (type === 'ws') ? this.wsPasses : this.webPasses;
        let i: false | number = false;

        passes.forEach(function (v, idx) {
            if (v.name === passName) i = idx;
        })

        if (i === false) throw new Error('No such pass');

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
function createRightProxy(type: string): (options: Server.ServerOptions) => Function {
    return function (options: Server.ServerOptions) {
        return function (req, res) {
            const passes = (type === 'ws') ? wsPasses : webPasses
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