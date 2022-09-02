import type { Server } from '../../types'
import type { IncomingMessage, ServerResponse } from 'http';
import { rewriteCookieProperty, mergeSetCookie, removeCookieProperty } from '../common'
const redirectRegex = /^201|30(1|2|7|8)$/;

/**
 * If is a HTTP 1.0 request, remove chunk headers
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { IncomingMessage } proxyRes Response object from the proxy request
 *
 * @api private
 */
export function removeChunked(req: IncomingMessage, res: ServerResponse, proxyRes: IncomingMessage): void | boolean {
    if (req.httpVersion === '1.0' || proxyRes.statusCode === 204 || proxyRes.statusCode === 304) {
        delete proxyRes.headers['transfer-encoding'];
    }
}

/**
 * If is a HTTP 1.0 request, set the correct connection header
 * or if connection header not present, then use `keep-alive`
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { IncomingMessage } proxyRes Response object from the proxy request
 *
 * @api private
 */
export function setConnection(req: IncomingMessage, res: ServerResponse, proxyRes: IncomingMessage): void | boolean {
    if (req.httpVersion === '1.0') {
        proxyRes.headers.connection = req.headers.connection || 'close';
    } else if (req.httpVersion !== '2.0' && !proxyRes.headers.connection) {
        proxyRes.headers.connection = req.headers.connection || 'keep-alive';
    }
}

/**
 * Set the headers from the proxyResponse
 * 
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { IncomingMessage } proxyRes Response object from the proxy request
 * @param { Server.ServerOptions } options Config object passed to the proxy
 * 
 * @api private
 */
export function setRedirectHostRewrite(req: IncomingMessage, res: ServerResponse, proxyRes: IncomingMessage, options: Server.ServerOptions): void | boolean {
    if ((options.hostRewrite || options.autoRewrite || options.protocolRewrite) && proxyRes.headers['location'] && redirectRegex.test(String(proxyRes.statusCode))) {

        const targetStr = typeof options.target === 'string' ? options.target : options.target?.href;
        // @ts-ignore
        const target = new URL(targetStr);

        const u = new URL(proxyRes.headers['location']);
        // make sure the redirected host matches the target host before rewriting
        if (target.host != u.host) {
            return;
        }

        if (options.hostRewrite) {
            u.host = options.hostRewrite;
        } else if (options.autoRewrite) {
            // @ts-ignore
            u.host = req.headers['host'];
        }

        if (options.protocolRewrite) {
            u.protocol = options.protocolRewrite;
        }

        proxyRes.headers['location'] = u.toString()
    }
}

/**
 * Copy headers from proxyResponse to response
 * set each header in response object.
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { IncomingMessage } proxyRes Response object from the proxy request
 * @param { Server.ServerOptions } options options.cookieDomainRewrite: Config to rewrite cookie domain
 *
 * @api private
 */
export function writeHeaders(req: IncomingMessage, res: ServerResponse, proxyRes: IncomingMessage, options: Server.ServerOptions): void | boolean {
    const preserveHeaderKeyCase = options.preserveHeaderKeyCase;
    const mergeCookiesConfig = options.mergeCookies
    const cookieRemoveSecure = options.cookieRemoveSecure

    let rewriteCookieDomainConfig = options.cookieDomainRewrite
    let rewriteCookiePathConfig = options.cookiePathRewrite
    let rawHeaderKeyMap: Record<string, unknown> = {};

    const setHeader = function (key: string, header: any) {
        if (rewriteCookieDomainConfig && key.toLowerCase() === 'set-cookie') {
            header = rewriteCookieProperty(header, rewriteCookieDomainConfig as Record<string, unknown>, 'domain');
        }
        if (rewriteCookiePathConfig && key.toLowerCase() === 'set-cookie') {
            header = rewriteCookieProperty(header, rewriteCookiePathConfig as Record<string, unknown>, 'path');
        }
        if (mergeCookiesConfig && key.toLowerCase() === 'set-cookie') {
            header = mergeSetCookie(res.getHeader('set-cookie'), header)
        }
        if (cookieRemoveSecure && key.toLowerCase() === 'set-cookie') {
            header = removeCookieProperty(header, 'secure');
        }

        try {
            res.setHeader(String(key).trim(), header);
        } catch (error) {
            console.warn(error, key, header);
        }
    };

    if (typeof rewriteCookieDomainConfig === 'string') { //also test for ''
        rewriteCookieDomainConfig = { '*': rewriteCookieDomainConfig };
    }

    if (typeof rewriteCookiePathConfig === 'string') { //also test for ''
        rewriteCookiePathConfig = { '*': rewriteCookiePathConfig };
    }

    // message.rawHeaders is added in: v0.11.6
    // https://nodejs.org/api/http.html#http_message_rawheaders
    if (preserveHeaderKeyCase && proxyRes.rawHeaders != undefined) {
        for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
            let key = proxyRes.rawHeaders[i];
            rawHeaderKeyMap[key.toLowerCase()] = key;
        }
    }

    Object.keys(proxyRes.headers).forEach(function (key) {
        const header = proxyRes.headers[key];
        if (preserveHeaderKeyCase && rawHeaderKeyMap) {
            (key as unknown) = rawHeaderKeyMap[key] || key;
        }
        setHeader(key, header);
    });
}

/**
 * Add headers from options.outgoingHeaders to response
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { IncomingMessage } proxyRes Response object from the proxy request
 * @param { Server.ServerOptions } options Object with options in it
 */
export function attachOutgoingHeaders(req: IncomingMessage, res: ServerResponse, proxyRes: IncomingMessage, options: Server.ServerOptions): void | boolean {
    if (options.outgoingHeaders != null) {
        Object.keys(options.outgoingHeaders).forEach(function (header) {
            res.setHeader(header, (options.outgoingHeaders as any)[header]);
        });
    }
}

/**
 * Set the statusCode from the proxyResponse
 *
 * @param { IncomingMessage } req Request object
 * @param { ServerResponse } res Response object
 * @param { IncomingMessage } proxyRes Response object from the proxy request
 *
 * @api private
 */
export function writeStatusCode(req: IncomingMessage, res: ServerResponse, proxyRes: IncomingMessage): void | boolean {
    // From Node.js docs: response.writeHead(statusCode[, statusMessage][, headers])
    if (proxyRes.statusMessage) {
        res.statusCode = proxyRes.statusCode as number;
        res.statusMessage = proxyRes.statusMessage;
    } else {
        res.statusCode = proxyRes.statusCode as number;
    }
}