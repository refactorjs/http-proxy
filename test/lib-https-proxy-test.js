import httpProxy from '../src/index.ts';
import semver from 'semver';
import expect from 'expect.js';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';

//
// Expose a port number generator.
// thanks to @3rd-Eden
//
var initialPort = 1024, gen = {};
Object.defineProperty(gen, 'port', {
    get: function get() {
        return initialPort++;
    }
});

describe('src/index.ts', function () {
    describe('HTTPS #createProxyServer', function () {
        describe('HTTPS to HTTP', function () {
            it('should proxy the request en send back the response', function (done) {
                var ports = { source: gen.port, proxy: gen.port };
                var source = http.createServer(function (req, res) {
                    expect(req.method).to.eql('GET');
                    expect(req.headers.host.split(':')[1]).to.eql(ports.proxy);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Hello from ' + ports.source);
                });

                source.listen(ports.source);

                var proxy = httpProxy.createProxyServer({
                    target: 'http://127.0.0.1:' + ports.source,
                    ssl: {
                        key: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-key.pem')),
                        cert: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-cert.pem')),
                        ciphers: 'AES128-GCM-SHA256',
                    }
                }).listen(ports.proxy);

                https.request({
                    host: 'localhost',
                    port: ports.proxy,
                    path: '/',
                    method: 'GET',
                    rejectUnauthorized: false
                }, function (res) {
                    expect(res.statusCode).to.eql(200);

                    res.on('data', function (data) {
                        expect(data.toString()).to.eql('Hello from ' + ports.source);
                    });

                    res.on('end', function () {
                        source.close();
                        proxy.close();
                        done();
                    })
                }).end();
            })
        });
        describe('HTTP to HTTPS', function () {
            it('should proxy the request en send back the response', function (done) {
                var ports = { source: gen.port, proxy: gen.port };
                var source = https.createServer({
                    key: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-key.pem')),
                    cert: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-cert.pem')),
                    ciphers: 'AES128-GCM-SHA256',
                }, function (req, res) {
                    expect(req.method).to.eql('GET');
                    expect(req.headers.host.split(':')[1]).to.eql(ports.proxy);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Hello from ' + ports.source);
                });

                source.listen(ports.source);

                var proxy = httpProxy.createProxyServer({
                    target: 'https://127.0.0.1:' + ports.source,
                    // Allow to use SSL self signed
                    secure: false
                }).listen(ports.proxy);

                http.request({
                    hostname: '127.0.0.1',
                    port: ports.proxy,
                    method: 'GET'
                }, function (res) {
                    expect(res.statusCode).to.eql(200);

                    res.on('data', function (data) {
                        expect(data.toString()).to.eql('Hello from ' + ports.source);
                    });

                    res.on('end', function () {
                        source.close();
                        proxy.close();
                        done();
                    });
                }).end();
            })
        })
        describe('HTTPS to HTTPS', function () {
            it('should proxy the request en send back the response', function (done) {
                var ports = { source: gen.port, proxy: gen.port };
                var source = https.createServer({
                    key: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-key.pem')),
                    cert: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-cert.pem')),
                    ciphers: 'AES128-GCM-SHA256',
                }, function (req, res) {
                    expect(req.method).to.eql('GET');
                    expect(req.headers.host.split(':')[1]).to.eql(ports.proxy);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Hello from ' + ports.source);
                });

                source.listen(ports.source);

                var proxy = httpProxy.createProxyServer({
                    target: 'https://127.0.0.1:' + ports.source,
                    ssl: {
                        key: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-key.pem')),
                        cert: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-cert.pem')),

                        ciphers: 'AES128-GCM-SHA256',
                    },
                    secure: false
                }).listen(ports.proxy);

                https.request({
                    host: 'localhost',
                    port: ports.proxy,
                    path: '/',
                    method: 'GET',
                    rejectUnauthorized: false
                }, function (res) {
                    expect(res.statusCode).to.eql(200);

                    res.on('data', function (data) {
                        expect(data.toString()).to.eql('Hello from ' + ports.source);
                    });

                    res.on('end', function () {
                        source.close();
                        proxy.close();
                        done();
                    })
                }).end();
            })
        });
        describe('HTTPS not allow SSL self signed', function () {
            it('should fail with error', function (done) {
                var ports = { source: gen.port, proxy: gen.port };
                var source = https.createServer({
                    key: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-key.pem')),
                    cert: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-cert.pem')),
                    ciphers: 'AES128-GCM-SHA256',
                })

                source.listen(ports.source);

                var proxy = httpProxy.createProxyServer({
                    target: 'https://127.0.0.1:' + ports.source,
                    agent: new http.Agent({ maxSockets: 2 }),
                    secure: true
                });

                proxy.listen(ports.proxy);

                proxy.on('error', function (err, req, res) {

                    expect(err).to.be.an(Error);
                    if (semver.gt(process.versions.node, '0.12.0')) {
                        expect(err.toString()).to.be('Error: unable to verify the first certificate')
                    } else {
                        expect(err.toString()).to.be('Error: DEPTH_ZERO_SELF_SIGNED_CERT')
                    }
                    done();
                })

                http.request({
                    hostname: '127.0.0.1',
                    port: ports.proxy,
                    method: 'GET'
                }).end();
            })
        })
        describe('HTTPS to HTTP using own server', function () {
            it('should proxy the request en send back the response', function (done) {
                var ports = { source: gen.port, proxy: gen.port };
                var source = http.createServer(function (req, res) {
                    expect(req.method).to.eql('GET');
                    expect(req.headers.host.split(':')[1]).to.eql(ports.proxy);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Hello from ' + ports.source);
                });

                source.listen(ports.source);

                var proxy = httpProxy.createServer({
                    agent: new http.Agent({ maxSockets: 2 })
                });

                var ownServer = https.createServer({
                    key: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-key.pem')),
                    cert: fs.readFileSync(path.join(path.resolve('test'), 'fixtures', 'agent2-cert.pem')),
                    ciphers: 'AES128-GCM-SHA256',
                }, function (req, res) {
                    proxy.web(req, res, {
                        target: 'http://127.0.0.1:' + ports.source
                    })
                }).listen(ports.proxy);

                https.request({
                    host: 'localhost',
                    port: ports.proxy,
                    path: '/',
                    method: 'GET',
                    rejectUnauthorized: false
                }, function (res) {
                    expect(res.statusCode).to.eql(200);

                    res.on('data', function (data) {
                        expect(data.toString()).to.eql('Hello from ' + ports.source);
                    });

                    res.on('end', function () {
                        source.close();
                        ownServer.close();
                        done();
                    })
                }).end();
            })
        })
    });
});
