import * as url from "url";
import * as net from "net";
import * as http from 'http';
import * as stream from 'stream';
import * as buffer from 'buffer';
import { ProxyServer } from "./proxy";

export interface ProxyTargetDetailed {
    href?: string;
    host: string;
    port: number;
    protocol?: string | undefined;
    hostname?: string | undefined;
    socketPath?: string | undefined;
    key?: string | undefined;
    passphrase?: string | undefined;
    pfx?: buffer.Buffer | string | undefined;
    cert?: string | buffer.Buffer | Array<string | buffer.Buffer> | undefined;
    ca?: string | buffer.Buffer | Array<string | buffer.Buffer> | undefined;
    ciphers?: string | undefined;
    secureProtocol?: string | undefined;
    searchParams?: string | url.URLSearchParams | undefined;
    pathname?: string | undefined;
    path?: string | undefined;
    method?: string;
    headers?: http.IncomingHttpHeaders;
}

export interface Passthrough {
    (req: http.IncomingMessage, res: http.ServerResponse): boolean | void;
    (req: http.IncomingMessage, res: stream.Duplex, head: buffer.Buffer): boolean | void;
    (req: http.IncomingMessage, res: http.ServerResponse, options: Server.ServerOptions, head: buffer.Buffer, server: ProxyServer, errorCallback: ( err: Error, req: http.IncomingMessage, res: http.ServerResponse, url: Server.ServerOptions['target'] ) => void ): boolean | void;
}

export declare namespace Server {
    type ProxyTarget = ProxyTargetUrl | url.URL & ProxyTargetDetailed;
    type ProxyTargetUrl = Partial<url.URL & ProxyTargetDetailed>;

    interface ServerOptions {
        /** URL string to be parsed with the url module. */
        target?: ProxyTarget | undefined;
        /** URL string to be parsed with the url module. */
        forward?: ProxyTargetUrl | undefined;
        /** Object to be passed to http(s).request. */
        agent?: any;
        /** Object to be passed to https.createServer(). */
        ssl?: any;
        /** If you want to proxy websockets. */
        ws?: boolean | undefined;
        /** Adds x- forward headers. */
        xfwd?: boolean | undefined;
        /** Verify SSL certificate. */
        secure?: boolean | undefined;
        /** Explicitly specify if we are proxying to another proxy. */
        toProxy?: boolean | undefined;
        /** Specify whether you want to prepend the target's path to the proxy path. */
        prependPath?: boolean | undefined;
        /** Specify whether you want to ignore the proxy path of the incoming request. */
        ignorePath?: boolean | undefined;
        /** Local interface string to bind for outgoing connections. */
        localAddress?: string | undefined;
        /** Changes the origin of the host header to the target URL. */
        changeOrigin?: boolean | undefined;
        /** specify whether you want to keep letter case of response header key */
        preserveHeaderKeyCase?: boolean | undefined;
        /** Basic authentication i.e. 'user:password' to compute an Authorization header. */
        auth?: string | undefined;
        /** Rewrites the location hostname on (301 / 302 / 307 / 308) redirects, Default: null. */
        hostRewrite?: string | undefined;
        /** Rewrites the location host/ port on (301 / 302 / 307 / 308) redirects based on requested host/ port.Default: false. */
        autoRewrite?: boolean | undefined;
        /** Rewrites the location protocol on (301 / 302 / 307 / 308) redirects to 'http' or 'https'.Default: null. */
        protocolRewrite?: string | undefined;
        /** rewrites domain of set-cookie headers. */
        cookieDomainRewrite?: false | string | { [oldDomain: string]: string } | undefined;
        /** rewrites path of set-cookie headers. Default: false */
        cookiePathRewrite?: false | string | { [oldPath: string]: string } | undefined;
        /** specify if you want to remove the secure flag from the cookie */
        cookieRemoveSecure?: boolean | undefined;
        /** allows to merge `set-cookie` headers from passed response and response from target. Default: false. */
        mergeCookies?: boolean | undefined;
        /** object with extra headers to be added to target requests. */
        headers?: { [header: string]: string } | undefined;
        /** object with extra headers to be added to proxy requests. */
        outgoingHeaders?: { [header: string]: string } | undefined;
        /** Timeout (in milliseconds) when proxy receives no response from target. Default: 120000 (2 minutes) */
        proxyTimeout?: number | undefined;
        /** Timeout (in milliseconds) for incoming requests */
        timeout?: number | undefined;
        /** Specify whether you want to follow redirects. Default: false */
        followRedirects?: boolean | undefined;
        /** if set to true the web passes will be run even if `selfHandleResponse` is also set to true. */
        forcePasses?: boolean | undefined;
        /** If set to true, none of the webOutgoing passes are called and it's your responsibility to appropriately return the response by listening and acting on the proxyRes event */
        selfHandleResponse?: boolean | Function | undefined;
        /** if set, this function will be called with three arguments `req`, `proxyReq` and `proxyRes` and should return a Duplex stream, data from the client websocket will be piped through this stream before being piped to the server, allowing you to influence the request data. */
        createWsClientTransformStream?: ( req: http.IncomingMessage, proxyReq: http.ClientRequest, proxyRes: http.IncomingMessage ) => net.Socket | undefined;
        /** if set, this function will be called with three arguments `req`, `proxyReq` and `proxyRes` and should return a Duplex stream, data from the server websocket will be piped through this stream before being piped to the client, allowing you to influence the response data. */
        createWsServerTransformStream?: ( req: http.IncomingMessage, proxyReq: http.ClientRequest, proxyRes: http.IncomingMessage ) => net.Socket | undefined;
        /** Buffer */
        buffer?: buffer.Buffer | undefined;
    }

    type StartCallback<TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (req: TIncomingMessage, res: TServerResponse, target: ProxyTargetUrl ) => void;
    type ProxyReqCallback<TClientRequest = http.ClientRequest, TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (proxyReq: TClientRequest, req: TIncomingMessage, res: TServerResponse, options: ServerOptions) => void;
    type ProxyResCallback<TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (proxyRes: TIncomingMessage, req: TIncomingMessage, res: TServerResponse) => void;
    type ProxyReqWsCallback<TClientRequest = http.ClientRequest, TIncomingMessage = http.IncomingMessage> = (
        proxyReq: TClientRequest,
        req: TIncomingMessage,
        socket: net.Socket,
        options: ServerOptions,
        head: any,
    ) => void;
    type EconnresetCallback<TError = Error, TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (
        err: TError,
        req: TIncomingMessage,
        res: TServerResponse,
        target: ProxyTargetUrl,
    ) => void;
    type EndCallback<TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (
        req: TIncomingMessage,
        res: TServerResponse,
        proxyRes: TIncomingMessage
    ) => void;
    type OpenCallback = (proxySocket: net.Socket) => void;
    type CloseCallback<TIncomingMessage = http.IncomingMessage> = (proxyRes: TIncomingMessage, proxySocket: net.Socket, proxyHead: any) => void;
    type ErrorCallback<TError = Error, TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (
        err: TError,
        req: TIncomingMessage,
        res: TServerResponse | net.Socket,
        target?: ProxyTargetUrl,
    ) => void;
}

export default Server;