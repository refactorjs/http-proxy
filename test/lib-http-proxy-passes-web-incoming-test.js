import * as webIncoming from '../src/proxy/passes/web.incoming';
import { createProxyServer } from '../src/proxy';
import concat from 'concat-stream';
import { parallel } from 'async';
import { createServer, get, request } from 'node:http';
import { describe, expect, it } from 'vitest';
import { waitForClosed } from './util';
import net from 'node:net';

describe('src/proxy/passes/web.incoming.ts', () => {
    describe('#deleteLength', () => {
        it('should change `content-length` for DELETE requests', () => {
            const stubRequest = {
                method: 'DELETE',
                headers: {},
            };
            webIncoming.deleteLength(stubRequest, {}, {});
            expect(stubRequest.headers['content-length']).toEqual('0');
        });

        it('should change `content-length` for OPTIONS requests', () => {
            const stubRequest = {
                method: 'OPTIONS',
                headers: {},
            };
            webIncoming.deleteLength(stubRequest, {}, {});
            expect(stubRequest.headers['content-length']).toEqual('0');
        });

        it('should remove `transfer-encoding` from empty DELETE requests', () => {
            const stubRequest = {
                method: 'DELETE',
                headers: {
                    'transfer-encoding': 'chunked',
                },
            };
            webIncoming.deleteLength(stubRequest, {}, {});
            expect(stubRequest.headers['content-length']).toEqual('0');
            expect(stubRequest.headers).not.toHaveProperty('transfer-encoding');
        });
    });

    describe('#timeout', () => {
        it('should set timeout on the socket', () => {
            let timeout = 0;
            const stubRequest = {
                socket: {
                    setTimeout: function (value) {
                        timeout = value;
                    },
                },
            };

            webIncoming.timeout(stubRequest, {}, { timeout: 5000 });
            expect(timeout).toEqual(5000);
        });
    });

    describe('#XHeaders', () => {
        const stubRequest = {
            socket: {
                remoteAddress: '192.168.1.2',
                remotePort: '8080',
            },
            headers: {
                host: '192.168.1.2:8080',
            },
        };

        it('set the correct x-forwarded-* headers', () => {
            webIncoming.XHeaders(stubRequest, {}, { xfwd: true });
            expect(stubRequest.headers['x-forwarded-for']).toBe('192.168.1.2');
            expect(stubRequest.headers['x-forwarded-port']).toBe('8080');
            expect(stubRequest.headers['x-forwarded-proto']).toBe('http');
        });
    });
});

describe('#createProxyServer.web() using own http server', () => {
    it('should proxy the request using the web proxy handler', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
        });

        function requestHandler(req, res) {
            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            res.end();
            source.close();
            proxyServer.close();

            expect(req.method).toEqual('GET');
            expect(req.headers.host.split(':')[1]).toEqual('8081');
        });

        proxyServer.listen('8081');
        source.listen('8080');

        request('http://127.0.0.1:8081', function () { }).end();
        await waitForClosed(proxyServer, source);
    });

    it('should detect a proxyReq event and modify headers', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8082',
        });

        proxy.on('proxyReq', function (proxyReq, req, res, options) {
            proxyReq.setHeader('X-Special-Proxy-Header', 'foobar');
        });

        function requestHandler(req, res) {
            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            res.end();
            source.close();
            proxyServer.close();
            expect(req.headers['x-special-proxy-header']).toEqual('foobar');
        });

        proxyServer.listen('8083');
        source.listen('8082');

        request('http://127.0.0.1:8083', function () { }).end();
        await waitForClosed(source, proxyServer);
    });

    it('should skip proxyReq event when handling a request with header "expect: 100-continue" [https://www.npmjs.com/advisories/1486]', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
        });

        proxy.on('proxyReq', function (proxyReq, req, res, options) {
            proxyReq.setHeader('X-Special-Proxy-Header', 'foobar');
        });

        function requestHandler(req, res) {
            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            res.end();
            source.close();
            proxyServer.close();
            expect(req.headers['x-special-proxy-header']).not.toEqual('foobar');
        });

        proxyServer.listen('8081');
        source.listen('8080');

        const postData = ''.padStart(1025, 'x');

        const postOptions = {
            hostname: '127.0.0.1',
            port: 8081,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                expect: '100-continue',
            },
        };

        const req = request(postOptions, function () { });
        req.write(postData);
        req.end();
        await waitForClosed(proxyServer, source);
    });

    it('should proxy the request and handle error via callback', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
        });

        const proxyServer = createServer(requestHandler);

        function requestHandler(req, res) {
            proxy.web(req, res, function (err) {
                res.end();
                proxyServer.close();
                expect(err).toBeInstanceOf(Error);
                expect(err.code).toBe('ECONNREFUSED');
            });
        }

        proxyServer.listen('8082');

        request(
            {
                hostname: '127.0.0.1',
                port: '8082',
                method: 'GET',
            },
            function () { },
        ).end();

        await waitForClosed(proxyServer);
    });

    it('should proxy the request and handle error via event listener', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
        });

        const proxyServer = createServer(requestHandler);

        function requestHandler(req, res) {
            proxy.once('error', function (err, errReq, errRes) {
                errRes.end();
                proxyServer.close();
                expect(err).toBeInstanceOf(Error);
                expect(errReq).toBe(req);
                expect(errRes).toBe(res);
                expect(err.code).toBe('ECONNREFUSED');
            });

            proxy.web(req, res);
        }

        proxyServer.listen('8083');

        request(
            {
                hostname: '127.0.0.1',
                port: '8083',
                method: 'GET',
            },
            function () { },
        ).end();

        await waitForClosed(proxyServer);
    });

    it('should forward the request and handle error via event listener', async () => {
        const proxy = createProxyServer({
            forward: 'http://127.0.0.1:8080',
        });

        const proxyServer = createServer(requestHandler);

        function requestHandler(req, res) {
            proxy.once('error', function (err, errReq, errRes) {
                proxyServer.close();
                expect(err).toBeInstanceOf(Error);
                expect(errReq).toBe(req);
                expect(errRes).toBe(res);
                expect(err.code).toBe('ECONNREFUSED');
            });

            proxy.web(req, res);
        }

        proxyServer.listen('8083');

        request(
            {
                hostname: '127.0.0.1',
                port: '8083',
                method: 'GET',
            },
            function () { },
        ).end();

        await waitForClosed(proxyServer);
    });

    it('should proxy the request and handle timeout error (proxyTimeout)', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:45000',
            proxyTimeout: 100,
        });

        net.createServer().listen(45000);

        const proxyServer = createServer(requestHandler);

        const started = new Date().getTime();

        function requestHandler(req, res) {
            proxy.once('error', function (err, errReq, errRes) {
                errRes.end();
                proxyServer.close();
                expect(err).toBeInstanceOf(Error);
                expect(errReq).toBe(req);
                expect(errRes).toBe(res);
                expect(new Date().getTime() - started).toBeGreaterThan(99);
                expect(err.code).toBe('ECONNRESET');
            });

            proxy.web(req, res);
        }

        proxyServer.listen('8089');

        request(
            {
                hostname: '127.0.0.1',
                port: '8089',
                method: 'GET',
            },
            function () { },
        ).end();
    });

    it('should proxy the request and handle timeout error', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:45001',
            timeout: 100,
        });

        net.createServer().listen(45001);

        const proxyServer = createServer(requestHandler);

        const started = new Date().getTime();

        function requestHandler(req, res) {
            proxy.once('econnreset', function (err, errReq, errRes) {
                proxyServer.close();
                expect(err).toBeInstanceOf(Error);
                expect(errReq).toBe(req);
                expect(errRes).toBe(res);
                expect(err.code).toBe('ECONNRESET');
            });

            proxy.web(req, res);
        }

        proxyServer.listen('8085');

        const req = request(
            {
                hostname: '127.0.0.1',
                port: '8085',
                method: 'GET',
            }, function () { });

        const closed = waitForClosed(proxyServer);

        req.on('error', async function (err) {
            expect(err).toBeInstanceOf(Error);
            expect(err.code).toBe('ECONNRESET');
            expect(new Date().getTime() - started).toBeGreaterThan(99);
            await closed;
        });

        req.end();
    });

    it('should proxy the request and handle client disconnect error', () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:45002',
        });

        net.createServer().listen(45002);

        const proxyServer = createServer(requestHandler);

        const started = new Date().getTime();

        function requestHandler(req, res) {
            proxy.once('econnreset', function (err, errReq, errRes) {
                proxyServer.close();
                expect(err).toBeInstanceOf(Error);
                expect(errReq).toEqual(req);
                expect(errRes).toEqual(res);
                expect(err.code).toBe('ECONNRESET');
            });

            proxy.web(req, res);
        }

        proxyServer.listen('8087');

        var req = request({
            hostname: '127.0.0.1',
            port: '8087',
            method: 'GET',
        }, function () { });

        const closed = waitForClosed(proxyServer);

        req.on('error', async (err) => {
            expect(err).toBeInstanceOf(Error);
            expect(err.code).toBe('ECONNRESET');
            expect(new Date().getTime() - started).toBeGreaterThan(99);
            await closed;
        });

        req.end();

        setTimeout(function () {
            req.destroy();
        }, 100);
    });

    it('should proxy the request and provide a proxyRes event with the request and response parameters', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
        });

        function requestHandler(req, res) {
            proxy.once('proxyRes', function (proxyRes, pReq, pRes) {
                pRes.end();
                source.close();
                proxyServer.close();
                expect(pReq).toBe(req);
                expect(pRes).toBe(res);
            });

            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            res.end('Response');
        });

        proxyServer.listen('8086');
        source.listen('8080');
        request('http://127.0.0.1:8086', function () { }).end();
        await waitForClosed(proxyServer, source);
    });

    // Parallel seems to fail everything else in the test suite
    it('should proxy the request and provide and respond to manual user response when using modifyResponse', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
            selfHandleResponse: true,
        });

        function requestHandler(req, res) {
            proxy.once('proxyRes', function (proxyRes, pReq, pRes) {
                proxyRes.pipe(
                    concat(function (body) {
                        expect(body.toString('utf8')).toEqual('Response');
                        pRes.end(Buffer.from('my-custom-response'));
                    }),
                );
            });

            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            res.end('Response');
        });

        parallel([(next) => proxyServer.listen(8086, next), (next) => source.listen(8080, next)],
            function (err) {
                get('http://127.0.0.1:8086', function (res) {
                    res.pipe(
                        concat(function (body) {
                            expect(body.toString('utf8')).toEqual('my-custom-response');
                            source.close();
                            proxyServer.close();
                        }),
                    );
                }).once('error', async () => {
                    await waitForClosed(proxyServer, source);
                });
            }
        );
    });

    it('should proxy the request and handle changeOrigin option', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8082',
            changeOrigin: true,
        });

        function requestHandler(req, res) {
            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            res.end();
            source.close();
            proxyServer.close();
            expect(req.method).toEqual('GET');
            expect(req.headers.host.split(':')[1]).toEqual('8082');
        });

        proxyServer.listen('8083');
        source.listen('8082');

        request('http://127.0.0.1:8083', function () { }).end();
        await waitForClosed(proxyServer, source);
    });

    it('should proxy the request with the Authorization header set', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
            auth: 'user:pass',
        });

        function requestHandler(req, res) {
            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            res.end();
            source.close();
            proxyServer.close();
            const auth = Buffer.from(req.headers.authorization.split(' ')[1], 'base64');
            expect(req.method).toEqual('GET');
            expect(auth.toString()).toEqual('user:pass');
        });

        proxyServer.listen('8081');
        source.listen('8080');

        request('http://127.0.0.1:8081', function () { }).end();
        await waitForClosed(proxyServer, source);
    });

    it('should proxy requests to multiple servers with different options', async () => {
        const proxy = createProxyServer();

        // proxies to two servers depending on url, rewriting the url as well
        // http://127.0.0.1:8080/s1/ -> http://127.0.0.1:8081/
        // http://127.0.0.1:8080/ -> http://127.0.0.1:8082/
        function requestHandler(req, res) {
            if (req.url.indexOf('/s1/') === 0) {
                proxy.web(req, res, {
                    ignorePath: true,
                    target: 'http://127.0.0.1:8081' + req.url.substring(3),
                });
            } else {
                proxy.web(req, res, {
                    target: 'http://127.0.0.1:8082',
                });
            }
        }

        const proxyServer = createServer(requestHandler);

        const source1 = createServer(function (req, res) {
            res.end();
            source1.close();
            expect(req.method).toEqual('GET');
            expect(req.headers.host.split(':')[1]).toEqual('8080');
            expect(req.url).toEqual('/test1');
        });

        const source2 = createServer(function (req, res) {
            res.end();
            source2.close();
            expect(req.method).toEqual('GET');
            expect(req.headers.host.split(':')[1]).toEqual('8080');
            expect(req.url).toEqual('/test2');
        });

        proxyServer.listen('8080');
        source1.listen('8081');
        source2.listen('8082');

        request('http://127.0.0.1:8080/s1/test1', function () { }).end();
        request('http://127.0.0.1:8080/test2', function () { }).end();

        await waitForClosed(source1, source2);
        proxyServer.close();
        await waitForClosed(proxyServer);
    });
});

describe('#followRedirects', () => {
    it('should proxy the request follow redirects', async () => {
        const proxy = createProxyServer({
            target: 'http://127.0.0.1:8080',
            followRedirects: true,
        });

        function requestHandler(req, res) {
            proxy.web(req, res);
        }

        const proxyServer = createServer(requestHandler);

        const source = createServer(function (req, res) {
            if (new URL(req.url, 'http://example.com').pathname === '/redirect') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('ok');
            }

            res.writeHead(301, { Location: '/redirect' });
            res.end();
        });

        proxyServer.listen('8081');
        source.listen('8080');

        request('http://127.0.0.1:8081', function (res) {
            source.close();
            proxyServer.close();
            expect(res.statusCode).toEqual(200);
        }).end();

        await waitForClosed(proxyServer, source);
    });
});
