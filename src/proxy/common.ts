import type { OutgoingOptions } from '../types';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
import required from 'requires-port';

const upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;

/**
 * Simple Regex for testing if protocol is https
 */
export const isSSL = /^(?:http|ws)s/;

/**
 * Copies the right headers from `options` and `req` to
 * `outgoing` which is then used to fire the proxied
 * request.
 *
 * @param { OutgoingOptions } outgoing Base object to be filled with required properties
 * @param { OutgoingOptions } options Config object passed to the proxy
 * @param { IncomingMessage } req Request Object
 * @param { string } forward string to select forward or target
 * 
 * @return { OutgoingOptions } Outgoing Object with all required properties set
 *
 * @api private
 */
export function setupOutgoing(outgoing: OutgoingOptions, options: OutgoingOptions, req: IncomingMessage, forward?: string): OutgoingOptions {

    const target = options[(forward || 'target') as keyof typeof options] as typeof options;

    if (typeof target === 'object') {
        if (!target.searchParams) {
            target.searchParams = new URLSearchParams();
        }

        if (target.path) {
            target.pathname = target.path;
            delete target.path;
        }
    }

    const sslEnabled = isSSL.test(target.protocol!)

    outgoing.port = target.port || (sslEnabled ? 443 : 80);

    for (const opt of ['host', 'hostname', 'socketPath', 'pfx', 'key', 'passphrase', 'cert', 'ca', 'ciphers', 'secureProtocol', 'servername']) {
        (outgoing as any)[opt] = (outgoing as any)[opt] || target[opt as keyof typeof target];
    }

    outgoing.method = options.method || req.method;
    outgoing.headers = Object.assign({}, req.headers);

    if (options.headers) {
        Object.assign(outgoing.headers, options.headers);
    }

    if (options.auth) {
        outgoing.auth = options.auth
    }

    if (options.ca) outgoing.ca = options.ca;

    if (sslEnabled) {
        // Respect `NODE_TLS_REJECT_UNAUTHORIZED` environment variable (https://nodejs.org/docs/latest/api/cli.html#node_tls_reject_unauthorizedvalue)
        const NODE_TLS_REJECT_UNAUTHORIZED = process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
        const rejectUnauthorizedEnv = typeof NODE_TLS_REJECT_UNAUTHORIZED !== 'undefined' ? NODE_TLS_REJECT_UNAUTHORIZED.toString() : undefined;
        outgoing.rejectUnauthorized = (typeof options.secure === "undefined") ? (rejectUnauthorizedEnv !== '0') : options.secure;
    }

    if (options.lookup) {
        outgoing.lookup = options.lookup;
    }

    outgoing.agent = options.agent || false;
    outgoing.localAddress = options.localAddress;

    //
    // Remark: If we are false and not upgrading, set the connection: close. This is the right thing to do
    // as node core doesn't handle this COMPLETELY properly yet.
    //
    if (!outgoing.agent) {
        outgoing.headers = outgoing.headers || {};
        if (typeof outgoing.headers.connection !== 'string' || !upgradeHeader.test(outgoing.headers.connection)) {
            outgoing.headers.connection = 'close';
        }
    }

    const targetPath = target && options.prependPath !== false ? (target.pathname || '') : '';

    //
    // Remark: Can we somehow not use url.parse as a perf optimization?
    //

    // Base just needs to resemble a valid URL,
    // we only care about the parsing of the path & params
    const reqUrl = new URL(req.url as string, 'http://example.com')

    for (const entry of target.searchParams!.entries()) {
        reqUrl.searchParams.set(entry[0], entry[1])
    }

    const params = reqUrl.search

    let outgoingPath = !options.toProxy ? (reqUrl.pathname || '') : req.url;

    //
    // Remark: ignorePath will just straight up ignore whatever the request's
    // path is. This can be labeled as FOOT-GUN material if you do not know what
    // you are doing and are using conflicting options.
    //
    outgoingPath = !options.ignorePath ? outgoingPath : '';

    outgoing.path = [targetPath, outgoingPath].filter(Boolean).join('/').replace(/\/+/g, '/') + params

    if (options.changeOrigin) {
        outgoing.headers.host = required(outgoing.port, target.protocol!) && !hasPort(outgoing.host.toString()) ? outgoing.host + ':' + outgoing.port : outgoing.host;
    }

    return outgoing;
};

/**
 * Set the proper configuration for sockets,
 * set no delay and set keep alive, also set
 * the timeout to 0.
 *
 * Examples:
 *
 *    setupSocket(socket)
 *    // => Socket
 *
 * @param { Socket } socket instance to setup
 * 
 * @return { Socket } Return the configured socket.
 *
 * @api private
 */
export function setupSocket(socket: Socket): Socket {
    socket.setTimeout(0);
    socket.setNoDelay(true);

    socket.setKeepAlive(true, 0);

    return socket;
};

/**
 * Get the port number from the host. Or guess it based on the connection type.
 *
 * @param { IncomingMessage } req Incoming HTTP request.
 *
 * @return { string } The port number.
 *
 * @api private
 */
export function getPort(req: IncomingMessage): string {
    const res = req.headers.host ? req.headers.host.match(/:(\d+)/) : '';

    return res ? res[1] : hasEncryptedConnection(req) ? '443' : '80';
};

/**
 * Check if the request has an encrypted connection.
 *
 * @param { IncomingMessage } req Incoming HTTP request.
 *
 * @return { Boolean } Whether the connection is encrypted or not.
 *
 * @api private
 */
export function hasEncryptedConnection(req: IncomingMessage): boolean {
    return req.socket instanceof TLSSocket && req.socket?.encrypted;
};

/**
 * Rewrites or removes the domain of a cookie header
 *
 * @param { string|Array } header
 * @param { Record<string, unknown> } config mapping of domain to rewritten domain. '*' key to match any domain, null value to remove the domain.
 *
 * @api private
 */
export function rewriteCookieProperty(header: string | Array<any>, config: Record<string, unknown>, property: string): string | Array<any> {
    if (Array.isArray(header)) {
        return header.map(function (headerElement) {
            return rewriteCookieProperty(headerElement, config, property);
        });
    }

    return header.replace(new RegExp("(;\\s*" + property + "=)([^;]+)", 'i'), function (match, prefix, previousValue) {
        let newValue;
        if (previousValue in config) {
            newValue = config[previousValue];
        } else if ('*' in config) {
            newValue = config['*'];
        } else {
            //no match, return previous value
            return match;
        }
        if (newValue) {
            //replace value
            return prefix + newValue;
        } else {
            //remove value
            return '';
        }
    });
};

/**
 * Removes the specified attribute from a cookie header.
 *
 * @param { string|Array } header
 * @param { string } property Name of attribute to remove
 *
 * @api private
 */
export function removeCookieProperty(header: string | string[], property: string): object | string {
    if (Array.isArray(header)) {
        return header.map(function (headerElement) {
            return removeCookieProperty(headerElement, property);
        });
    }
    // Intentionally not checking for "=" to catch directives with no value (eg "; secure").
    return header.replace(new RegExp(';\\s*' + property + '[^;]*', 'i'), '');
};

/**
 * Merges `Set-Cookie` header
 *
 * @param { string|string[] } setCookie
 * @param { string|string[] } upstreamSetCookie
 * @returns { string[] }
 *
 * @api private
 */
export function mergeSetCookie(setCookie: string | Array<any> | number | undefined, upstreamSetCookie: string | string[]): string[] {
    let existingCookieArray = setCookie || [],
        upstreamCookieArray = upstreamSetCookie || [];

    if (!Array.isArray(existingCookieArray)) {
        existingCookieArray = [existingCookieArray]
    }

    if (!Array.isArray(upstreamCookieArray)) {
        upstreamCookieArray = [upstreamCookieArray]
    }

    return existingCookieArray.concat(upstreamCookieArray);
};

/**
 * Check the host and see if it potentially has a port in it (keep it simple)
 * 
 * @param { string } host
 * @returns { Boolean } Whether we have one or not
 *
 * @api private
 */
function hasPort(host: string): boolean {
    return !!~host.indexOf(':');
};