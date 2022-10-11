import type { Server, WebPassthrough, WsPassthrough } from '../types'
import type { Socket } from 'node:net';
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import https from 'node:https';
import * as webIncoming from './passes/web.incoming';
import * as wsIncoming from './passes/ws.incoming';

export class ProxyServer extends EventEmitter {
    options: Server.ServerOptions;
    server?: http.Server | https.Server = undefined;
    webPasses: WebPassthrough[];
    wsPasses: WsPassthrough[];

    /**
     * Creates the proxy server with specified options.
     * @param options - Config object passed to the proxy
     */
    constructor(options: Server.ServerOptions = {}) {
        super();

        options.prependPath = options.prependPath === false ? false : true;
        this.options = options;

        this.webPasses = Object.keys(webIncoming).map(pass => webIncoming[pass as keyof typeof webIncoming] as WebPassthrough);
        this.wsPasses = Object.keys(wsIncoming).map(pass => wsIncoming[pass as keyof typeof wsIncoming] as WsPassthrough)

        super.on('error', this.onError);
    }

    onError(err: Error) {
        if (super.listeners('error').length === 1) {
            throw err;
        }
    }

    /**
     * A function that wraps the object in a webserver, for your convenience
     * @param port - Port to listen on
     * @param hostname - Hostname to listen on
     */
    listen(port: number, hostname: string) {
        const closure = (req: IncomingMessage, res: ServerResponse) => {
            this.web(req, res);
        };

        this.server = this.options.ssl ? https.createServer(this.options.ssl, closure) : http.createServer(closure);

        if (this.options.ws) {
            this.server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
                this.ws(req, socket, head);
            });
        }

        this.server.listen(port, hostname);

        return this;
    }

    /**
     * A function that closes the inner webserver and stops listening on given port
     */
    close(callback?: () => void) {
        if (this.server) {
            this.server.close(() => {
                this.server = undefined;
                callback?.();
            });
        }
    }

    before(type: 'web' | 'ws', passName: string, callback: WebPassthrough & WsPassthrough) {
        const passes = (type === 'ws') ? this.wsPasses : this.webPasses;
        let i = -1;

        passes.forEach(function (v, idx) {
            if (v.name === passName) i = idx;
        })

        if (i === -1) throw new Error('No such pass');

        passes.splice(i, 0, callback);
    }

    after(type: 'web' | 'ws', passName: string, callback: WebPassthrough & WsPassthrough) {
        const passes = (type === 'ws') ? this.wsPasses : this.webPasses;
        let i = -1;

        passes.forEach(function (v, idx) {
            if (v.name === passName) i = idx;
        })

        if (i === -1) throw new Error('No such pass');

        passes.splice(i++, 0, callback);
    }

    /**
     * Used for proxying regular HTTP(S) requests
     * @param req - Client request.
     * @param res - Client response.
     * @param args - Additional arguments for the web proxy.
     */
    web(req: IncomingMessage, res: ServerResponse, ...args: any[]) {
        let index = args.length - 1;
        let callback: Server.ErrorCallback | undefined = undefined;
        let proxyOptions = this.options;

        /* optional args parse begin */
        if (typeof args[index] === 'function') {
            callback = args[index];
        }

        //Overwrite with request options
        proxyOptions = Object.assign({}, this.options);
        Object.assign(proxyOptions, args[index]);

        /* optional args parse end */
        for (const opt of ['target', 'forward']) {
            if (typeof proxyOptions[opt as keyof Server.ServerOptions] === 'string') {
                (proxyOptions as any)[opt as keyof Server.ServerOptions] = new URL(proxyOptions[opt as keyof Server.ServerOptions] as string);
            }
        }

        if (!proxyOptions.target && !proxyOptions.forward) {
            return super.emit('error', new Error('Must provide a proper URL as target'));
        }

        for (let i = 0; i < this.webPasses.length; i++) {
            if (this.webPasses[i](req, res, proxyOptions, this, callback)) {
                break;
            }
        }
    }

    /**
     * Used for proxying regular HTTP(S) requests
     * @param req - Client request.
     * @param socket - Client socket.
     * @param args - Additional arguments for the websocket proxy
     */
    ws(req: IncomingMessage, socket: Socket, ...args: any[]) {
        let index = args.length - 1;
        let head: Buffer | undefined = undefined;
        let callback: Server.ErrorCallback | undefined = undefined;
        let proxyOptions = this.options;

        /* optional args parse begin */
        if (typeof args[index] === 'function') {
            callback = args[index];
        }

        if (!(args[index] instanceof Buffer)) {
            //Overwrite with request options
            proxyOptions = Object.assign({}, this.options);
            Object.assign(proxyOptions, args[index]);
        }

        if (args[index] instanceof Buffer) {
            head = args[index];
        }

        /* optional args parse end */
        for (const opt of ['target', 'forward']) {
            if (typeof proxyOptions[opt as keyof Server.ServerOptions] === 'string') {
                (proxyOptions as any)[opt as keyof Server.ServerOptions] = new URL(proxyOptions[opt as keyof Server.ServerOptions] as string);
            }
        }

        if (!proxyOptions.target && !proxyOptions.forward) {
            return super.emit('error', new Error('Must provide a proper URL as target'));
        }

        for (let i = 0; i < this.wsPasses.length; i++) {
            if (this.wsPasses[i](req, socket, proxyOptions, head, this, callback)) {
                break;
            }
        }
    }
}

export const createProxyServer = (options?: Server.ServerOptions): ProxyServer => {
    return new ProxyServer(options);
}

export const createServer = (options?: Server.ServerOptions): ProxyServer => {
    return new ProxyServer(options);
}

export const createProxy = (options?: Server.ServerOptions): ProxyServer => {
    return new ProxyServer(options);
}
