import { createProxyServer, createServer } from '../src/proxy';
import http, { request } from 'http';
import https from 'https';
import { join } from 'path';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { waitForClosed } from './util';

//
// Expose a port number generator.
// thanks to @3rd-Eden
//
let initialPort = 1024;
const gen = {};
Object.defineProperty(gen, 'port', {
    get: function get() {
        return initialPort++;
    },
});

describe('src/index.ts', () => {
    describe('HTTPS #createProxyServer', () => {
        describe('HTTPS to HTTP', () => {
            it('should proxy the request en send back the response', async () => {
                const ports = { source: gen.port, proxy: gen.port };
                const source = http.createServer(function (req, res) {
                    expect(req.method).toEqual('GET');
                    expect(req.headers.host.split(':')[1]).toEqual(String(ports.proxy));
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Hello from ' + ports.source);
                });

                source.listen(ports.source);

                const proxy = createProxyServer({
                    target: 'http://127.0.0.1:' + ports.source,
                    ssl: {
                        key: readFileSync(join(__dirname, 'fixtures', 'agent2-key.pem')),
                        cert: readFileSync(join(__dirname, 'fixtures', 'agent2-cert.pem')),
                        ciphers: 'AES128-GCM-SHA256',
                    },
                }).listen(ports.proxy);

                https
                    .request(
                        {
                            host: 'localhost',
                            port: ports.proxy,
                            path: '/',
                            method: 'GET',
                            rejectUnauthorized: false,
                        },
                        function (res) {
                            expect(res.statusCode).toEqual(200);

                            res.on('data', function (data) {
                                expect(data.toString()).toEqual('Hello from ' + ports.source);
                            });

                            res.on('end', function () {
                                source.close();
                                proxy.close();
                            });
                        },
                    )
                    .end();

                await waitForClosed(source);
            });
        });
        describe('HTTP to HTTPS', () => {
            it('should proxy the request en send back the response', async () => {
                const ports = { source: gen.port, proxy: gen.port };
                const source = https.createServer({
                        key: readFileSync(join(__dirname, 'fixtures', 'agent2-key.pem')),
                        cert: readFileSync(join(__dirname, 'fixtures', 'agent2-cert.pem')),
                        ciphers: 'AES128-GCM-SHA256',
                    },
                    function (req, res) {
                        expect(req.method).toEqual('GET');
                        expect(req.headers.host.split(':')[1]).toEqual(String(ports.proxy));
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Hello from ' + ports.source);
                    },
                );

                source.listen(ports.source);

                const proxy = createProxyServer({
                    target: 'https://127.0.0.1:' + ports.source,
                    // Allow to use SSL self signed
                    secure: false,
                }).listen(ports.proxy);

                const serversClosed = new Promise((resolve) => {
                    request(
                        {
                            hostname: '127.0.0.1',
                            port: ports.proxy,
                            method: 'GET',
                        },
                        function (res) {
                            expect(res.statusCode).toEqual(200);

                            res.on('data', function (data) {
                                expect(data.toString()).toEqual('Hello from ' + ports.source);
                            });

                            res.on('end', function () {
                                source.close(() => {
                                    proxy.close(() => {
                                        resolve();
                                    });
                                });
                            });
                        },
                    ).end();
                });

                await serversClosed;
            });
        });
        describe('HTTPS to HTTPS', () => {
            it('should proxy the request en send back the response', async () => {
                const ports = { source: gen.port, proxy: gen.port };
                const source = https.createServer(
                    {
                        key: readFileSync(join(__dirname, 'fixtures', 'agent2-key.pem')),
                        cert: readFileSync(join(__dirname, 'fixtures', 'agent2-cert.pem')),
                        ciphers: 'AES128-GCM-SHA256',
                    },
                    function (req, res) {
                        expect(req.method).toEqual('GET');
                        expect(req.headers.host.split(':')[1]).toEqual(String(ports.proxy));
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Hello from ' + ports.source);
                    },
                );

                source.listen(ports.source);

                const proxy = createProxyServer({
                    target: 'https://127.0.0.1:' + ports.source,
                    ssl: {
                        key: readFileSync(join(__dirname, 'fixtures', 'agent2-key.pem')),
                        cert: readFileSync(join(__dirname, 'fixtures', 'agent2-cert.pem')),
                        ciphers: 'AES128-GCM-SHA256',
                    },
                    secure: false,
                }).listen(ports.proxy);

                const serversClosedPromise = new Promise((resolve) => {
                    https
                        .request(
                            {
                                host: 'localhost',
                                port: ports.proxy,
                                path: '/',
                                method: 'GET',
                                rejectUnauthorized: false,
                            },
                            function (res) {
                                expect(res.statusCode).toEqual(200);

                                res.on('data', function (data) {
                                    expect(data.toString()).toEqual('Hello from ' + ports.source);
                                });

                                res.on('end', function () {
                                    source.close(() => {
                                        proxy.close(() => {
                                            resolve();
                                        });
                                    });
                                });
                            },
                        )
                        .end();
                });

                await serversClosedPromise;
            });
        });
        describe('HTTPS not allow SSL self signed', () => {
            it('should fail with error', async () => {
                const ports = { source: gen.port, proxy: gen.port };
                const source = https
                    .createServer({
                        key: readFileSync(join(__dirname, 'fixtures', 'agent2-key.pem')),
                        cert: readFileSync(join(__dirname, 'fixtures', 'agent2-cert.pem')),
                        ciphers: 'AES128-GCM-SHA256',
                    })
                    .listen(ports.source);

                const proxy = createProxyServer({
                    target: 'https://127.0.0.1:' + ports.source,
                    secure: true,
                });

                proxy.listen(ports.proxy);

                const serversClosed = new Promise((resolve) => {
                    proxy.on('error', function (err, req, res) {
                        expect(err).toBeInstanceOf(Error);
                        expect(err.toString()).toBe(
                            'Error: unable to verify the first certificate',
                        );
                        res.end();
                        source.close(() => {
                            proxy.close(() => {
                                resolve();
                            });
                        });
                    });
                });

                request(
                    {
                        hostname: '127.0.0.1',
                        port: ports.proxy,
                        method: 'GET',
                    },
                    (res) => { },
                ).end();

                await serversClosed;
            });
        });
        describe('HTTPS to HTTP using own server', () => {
            it('should proxy the request en send back the response', async () => {
                const ports = { source: gen.port, proxy: gen.port };
                const source = http.createServer(function (req, res) {
                    expect(req.method).toEqual('GET');
                    expect(req.headers.host.split(':')[1]).toEqual(String(ports.proxy));
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Hello from ' + ports.source);
                });

                source.listen(ports.source);

                const proxy = createServer({
                    agent: new http.Agent({ maxSockets: 2 }),
                });

                const ownServer = https
                    .createServer(
                        {
                            key: readFileSync(join(__dirname, 'fixtures', 'agent2-key.pem')),
                            cert: readFileSync(
                                join(__dirname, 'fixtures', 'agent2-cert.pem'),
                            ),
                            ciphers: 'AES128-GCM-SHA256',
                        },
                        function (req, res) {
                            proxy.web(req, res, {
                                target: 'http://127.0.0.1:' + ports.source,
                            });
                        },
                    )
                    .listen(ports.proxy);

                https
                    .request(
                        {
                            host: 'localhost',
                            port: ports.proxy,
                            path: '/',
                            method: 'GET',
                            rejectUnauthorized: false,
                        },
                        function (res) {
                            expect(res.statusCode).toEqual(200);

                            res.on('data', function (data) {
                                expect(data.toString()).toEqual('Hello from ' + ports.source);
                            });

                            res.on('end', function () {
                                source.close();
                                ownServer.close();
                            });
                        },
                    )
                    .end();

                await waitForClosed(source, ownServer);
            });
        });
    });
});
