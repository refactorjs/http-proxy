import * as net from "node:net";
import * as http from "node:http";
import * as url from "node:url";
import * as stream from "node:stream";

export interface ProxyTargetDetailed {
    host: string;
    port: number;
    protocol?: string | undefined;
    hostname?: string | undefined;
    socketPath?: string | undefined;
    key?: string | undefined;
    passphrase?: string | undefined;
    pfx?: Buffer | string | undefined;
    cert?: string | undefined;
    ca?: string | undefined;
    ciphers?: string | undefined;
    secureProtocol?: string | undefined;
}

export declare namespace Server {
    type ProxyTarget = ProxyTargetUrl | ProxyTargetDetailed;
    type ProxyTargetUrl = string | Partial<url.Url>;

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
        /** object with extra headers to be added to target requests. */
        headers?: { [header: string]: string } | undefined;
        /** Timeout (in milliseconds) when proxy receives no response from target. Default: 120000 (2 minutes) */
        proxyTimeout?: number | undefined;
        /** Timeout (in milliseconds) for incoming requests */
        timeout?: number | undefined;
        /** Specify whether you want to follow redirects. Default: false */
        followRedirects?: boolean | undefined;
        /** If set to true, none of the webOutgoing passes are called and it's your responsibility to appropriately return the response by listening and acting on the proxyRes event */
        selfHandleResponse?: boolean | undefined;
        /** Buffer */
        buffer?: stream.Stream | undefined;
    }

    type StartCallback<TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (
        req: TIncomingMessage,
        res: TServerResponse,
        target: ProxyTargetUrl,
    ) => void;
    type ProxyReqCallback<
        TClientRequest = http.ClientRequest,
        TIncomingMessage = http.IncomingMessage,
        TServerResponse = http.ServerResponse,
        > = (proxyReq: TClientRequest, req: TIncomingMessage, res: TServerResponse, options: ServerOptions) => void;
    type ProxyResCallback<TIncomingMessage = http.IncomingMessage, TServerResponse = http.ServerResponse> = (
        proxyRes: TIncomingMessage,
        req: TIncomingMessage,
        res: TServerResponse,
    ) => void;
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