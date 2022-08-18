<h1 align="center" >Http Proxy</h1>
<p align="center">An Alternative to HTTP Proxy</p>

<p align="center">
<a href="https://www.npmjs.com/package/@refactorjs/http-proxy">
    <img alt="" src="https://img.shields.io/npm/v/@refactorjs/http-proxy.svg?style=flat-square">
</a>
<a href="https://www.npmjs.com/package/@refactorjs/http-proxy">
    <img alt="" src="https://img.shields.io/npm/dt/@refactorjs/http-proxy.svg?style=flat-square">
</a>
</p>

## Description

This is meant as a project to convert `node-http-proxy/http-proxy` to typescript. While also incorporating some of the pull requests that were left unanswered/uncomitted that were useful.

## Development

Running tests for development:

```bash
$ npm install
$ npm run build
$ npm run test
```

## Options

`ProxySever | createProxyServer | createServer | createProxy` supports the following options:

- **target:** `string` - url string to be parsed with the url module
- **forward:** `string` - url string to be parsed with the url module
- **agent:** `object` - object to be passed to http(s).request (see Node's [https agent](http://nodejs.org/api/https.html#https_class_https_agent) and [http agent](http://nodejs.org/api/http.html#http_class_http_agent) objects)
- **ssl:** `object` - object to be passed to https.createServer()
- **ws:** `boolean`- if you want to proxy websockets
- **xfwd:** `boolean` - adds x-forward headers
- **secure:** `boolean` - if you want to verify the SSL Certs
- **toProxy:** `boolean` - passes the absolute URL as the `path` (useful for proxying to proxies)
- **prependPath:** `boolean` - Default: true - specify whether you want to prepend the target's path to the proxy path
- **ignorePath:** `boolean` - Default: false - specify whether you want to ignore the proxy path of the incoming request (note: you will have to append / manually if required).
- **localAddress:** `string` Local interface string to bind for outgoing connections
- **changeOrigin:** `boolean` - Default: false - changes the origin of the host header to the target URL
- **preserveHeaderKeyCase:** `boolean` - Default: false - specify whether you want to keep letter case of response header key
- **auth:** `string` - Basic authentication i.e. 'user:password' to compute an Authorization header.
- **hostRewrite:** `string` - rewrites the location hostname on (201/301/302/307/308) redirects.
- **autoRewrite:** `boolean` - rewrites the location host/port on (201/301/302/307/308) redirects based on requested host/port. Default: false.
- **protocolRewrite:** `http|https|null` - rewrites the location protocol on (201/301/302/307/308) redirects to 'http' or 'https'.
- **cookieDomainRewrite:** `false|string|object` - rewrites domain of `set-cookie` headers. Possible values:
    * `false` (default): disable cookie rewriting
    * `string`: new domain, for example `cookieDomainRewrite: "new.domain"`. To remove the domain, use `cookieDomainRewrite: ""`.
    * `object`: mapping of domains to new domains, use `"*"` to match all domains.
    For example keep one domain unchanged, rewrite one domain and remove other domains:
    ```ts
    cookieDomainRewrite: {
        "unchanged.domain": "unchanged.domain",
        "old.domain": "new.domain",
        "*": ""
    }
    ```

- **cookiePathRewrite:** `false|string|object` - rewrites path of `set-cookie` headers. Possible values:
    * `false` (default): disable cookie rewriting
    * `string`: new path, for example `cookiePathRewrite: "/newPath/"`. To remove the path, use `cookiePathRewrite: ""`. To set path to root use `cookiePathRewrite: "/"`.
    * `object`: mapping of paths to new paths, use `"*"` to match all paths.
    For example, to keep one path unchanged, rewrite one path and remove other paths:
    ```ts
    cookiePathRewrite: {
        "/unchanged.path/": "/unchanged.path/",
        "/old.path/": "/new.path/",
        "*": ""
    }
    ```
- **cookieRemoveSecure:** `boolean` - specify if you want to remove the secure flag from the cookie
- **mergeCookies:** `boolean` - allows to merge `set-cookie` headers from passed response and response from target. Default: false.
- **headers:** `object` - object with extra headers to be added to target requests.
- **outgoingHeaders:** `object` - object with extra headers to be added to proxy requests.
- **proxyTimeout:** `number` timeout (in millis) for outgoing proxy requests
- **timeout:** `number` timeout (in millis) for incoming requests
- **followRedirects:** `boolean` - Default: false - specify whether you want to follow redirects
- **forcePasses:** `boolean` - if set to true the web passes will be run even if `selfHandleResponse` is also set to true. (Default: false)
- **selfHandleResponse:** `boolean` - if set to true, none of the webOutgoing passes are called and it's your responsibility to appropriately return the response by listening and acting on the `proxyRes` event
- **createWsClientTransformStream:** `function|null` if set, this function will be called with three arguments `req`, `proxyReq` and `proxyRes` and should return a Duplex stream, data from the client websocket will be piped through this stream before being piped to the server, allowing you to influence the request data.
- **createWsServerTransformStream:** `function|null` if set, this function will be called with three arguments `req`, `proxyReq` and `proxyRes` and should return a Duplex stream, data from the server websocket will be piped through this stream before being piped to the client, allowing you to influence the response data.
- **buffer:** `Buffer` stream of data to send as the request body. Maybe you have some middleware that consumes the request stream before proxying it on e.g. If you read the body of a request into a field called 'req.rawbody' you could restream this field in the buffer option:
    ```ts
    import streamify from 'stream-array'
    import { ProxyServer } from '@refactorjs/http-proxy'
    const proxy = new ProxyServer();

    export function (req, res, next) {
        proxy.web(req, res, {
            target: 'http://localhost:4003/',
            buffer: streamify(req.rawBody)
        }, next);
    }
    ```

#### NOTE:
`options.ws` and `options.ssl` are optional.
`options.target` and `options.forward` cannot both be missing.

If you are using the `listen` method, the following options are also applicable:

- **ssl:** `object` - object to be passed to https.createServer()
- **ws:** `boolean` - if you want to proxy websockets