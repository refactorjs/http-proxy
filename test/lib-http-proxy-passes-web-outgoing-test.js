import { attachOutgoingHeaders, removeChunked, chunkedResponse, setConnection, setRedirectHostRewrite, writeHeaders, writeStatusCode } from '../src/proxy/passes/web.outgoing';
import { beforeEach, describe, expect, it } from 'vitest';

describe('src/proxy/passes/web.outgoing.ts', () => {
    let testContext;

    beforeEach(() => {
        testContext = {};
    });

    describe('#setRedirectHostRewrite', () => {
        beforeEach(() => {
            testContext.req = {
                headers: {
                    host: 'ext-auto.com',
                },
            };
            testContext.proxyRes = {
                statusCode: 301,
                headers: {
                    location: 'http://backend.com/',
                },
            };
            testContext.options = {
                target: new URL('http://backend.com'),
            };
        });

        describe('rewrites location host with hostRewrite', () => {
            beforeEach(() => {
                testContext.options.hostRewrite = 'ext-manual.com';
            });
            [201, 301, 302, 307, 308].forEach(function (code) {
                it('on ' + code, () => {
                    testContext.proxyRes.statusCode = code;
                    setRedirectHostRewrite(
                        testContext.req,
                        {},
                        testContext.proxyRes,
                        testContext.options,
                    );
                    expect(testContext.proxyRes.headers.location).toEqual(
                        'http://ext-manual.com/',
                    );
                });
            });

            it('not on 200', () => {
                testContext.proxyRes.statusCode = 200;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com/',
                );
            });

            it('not when hostRewrite is unset', () => {
                delete testContext.options.hostRewrite;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com/',
                );
            });

            it('takes precedence over autoRewrite', () => {
                testContext.options.autoRewrite = true;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://ext-manual.com/',
                );
            });

            it('not when the redirected location does not match target host', () => {
                testContext.proxyRes.statusCode = 302;
                testContext.proxyRes.headers.location = 'http://some-other/';
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://some-other/',
                );
            });

            it('not when the redirected location does not match target port', () => {
                testContext.proxyRes.statusCode = 302;
                testContext.proxyRes.headers.location = 'http://backend.com:8080/';
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com:8080/',
                );
            });
        });

        describe('rewrites location host with autoRewrite', () => {
            beforeEach(() => {
                testContext.options.autoRewrite = true;
            });
            [201, 301, 302, 307, 308].forEach(function (code) {
                it('on ' + code, () => {
                    testContext.proxyRes.statusCode = code;
                    setRedirectHostRewrite(
                        testContext.req,
                        {},
                        testContext.proxyRes,
                        testContext.options,
                    );
                    expect(testContext.proxyRes.headers.location).toEqual(
                        'http://ext-auto.com/',
                    );
                });
            });

            it('not on 200', () => {
                testContext.proxyRes.statusCode = 200;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com/',
                );
            });

            it('not when autoRewrite is unset', () => {
                delete testContext.options.autoRewrite;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com/',
                );
            });

            it('not when the redirected location does not match target host', () => {
                testContext.proxyRes.statusCode = 302;
                testContext.proxyRes.headers.location = 'http://some-other/';
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://some-other/',
                );
            });

            it('not when the redirected location does not match target port', () => {
                testContext.proxyRes.statusCode = 302;
                testContext.proxyRes.headers.location = 'http://backend.com:8080/';
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com:8080/',
                );
            });
        });

        describe('rewrites location protocol with protocolRewrite', () => {
            beforeEach(() => {
                testContext.options.protocolRewrite = 'https';
            });
            [201, 301, 302, 307, 308].forEach(function (code) {
                it('on ' + code, () => {
                    testContext.proxyRes.statusCode = code;
                    setRedirectHostRewrite(
                        testContext.req,
                        {},
                        testContext.proxyRes,
                        testContext.options,
                    );
                    expect(testContext.proxyRes.headers.location).toEqual(
                        'https://backend.com/',
                    );
                });
            });

            it('not on 200', () => {
                testContext.proxyRes.statusCode = 200;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com/',
                );
            });

            it('not when protocolRewrite is unset', () => {
                delete testContext.options.protocolRewrite;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'http://backend.com/',
                );
            });

            it('works together with hostRewrite', () => {
                testContext.options.hostRewrite = 'ext-manual.com';
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'https://ext-manual.com/',
                );
            });

            it('works together with autoRewrite', () => {
                testContext.options.autoRewrite = true;
                setRedirectHostRewrite(
                    testContext.req,
                    {},
                    testContext.proxyRes,
                    testContext.options,
                );
                expect(testContext.proxyRes.headers.location).toEqual(
                    'https://ext-auto.com/',
                );
            });
        });
    });

    describe('#setConnection', () => {
        it('set the right connection with 1.0 - `close`', () => {
            const proxyRes = { headers: {} };
            setConnection(
                {
                    httpVersion: '1.0',
                    headers: {
                        connection: null,
                    },
                },
                {},
                proxyRes,
            );

            expect(proxyRes.headers.connection).toEqual('close');
        });

        it('set the right connection with 1.0 - req.connection', () => {
            const proxyRes = { headers: {} };
            setConnection(
                {
                    httpVersion: '1.0',
                    headers: {
                        connection: 'hey',
                    },
                },
                {},
                proxyRes,
            );

            expect(proxyRes.headers.connection).toEqual('hey');
        });

        it('set the right connection - req.connection', () => {
            const proxyRes = { headers: {} };
            setConnection(
                {
                    httpVersion: null,
                    headers: {
                        connection: 'hola',
                    },
                },
                {},
                proxyRes,
            );

            expect(proxyRes.headers.connection).toEqual('hola');
        });

        it('set the right connection - `keep-alive`', () => {
            const proxyRes = { headers: {} };
            setConnection(
                {
                    httpVersion: null,
                    headers: {
                        connection: null,
                    },
                },
                {},
                proxyRes,
            );

            expect(proxyRes.headers.connection).toEqual('keep-alive');
        });

        it('don`t set connection with 2.0 if exist', () => {
            const proxyRes = { headers: {} };
            setConnection(
                {
                    httpVersion: '2.0',
                    headers: {
                        connection: 'namstey',
                    },
                },
                {},
                proxyRes,
            );

            expect(proxyRes.headers.connection).toEqual(undefined);
        });

        it('don`t set connection with 2.0 if doesn`t exist', () => {
            const proxyRes = { headers: {} };
            setConnection(
                {
                    httpVersion: '2.0',
                    headers: {},
                },
                {},
                proxyRes,
            );

            expect(proxyRes.headers.connection).toEqual(undefined);
        });
    });

    describe('#writeStatusCode', () => {
        it('should write status code', () => {
            const res = {
                writeHead: function (n) {
                    expect(n).toEqual(200);
                },
            };

            writeStatusCode({}, res, { statusCode: 200 });
        });
    });

    describe('#writeHeaders', () => {
        beforeEach(() => {
            testContext.proxyRes = {
                headers: {
                    hey: 'hello',
                    how: 'are you?',
                    'set-cookie': [
                        'hello; domain=my.domain; path=/',
                        'there; domain=my.domain; path=/',
                    ],
                },
            };
            testContext.rawProxyRes = {
                headers: {
                    hey: 'hello',
                    how: 'are you?',
                    'set-cookie': [
                        'hello; domain=my.domain; path=/',
                        'there; domain=my.domain; path=/',
                    ],
                },
                rawHeaders: [
                    'Hey',
                    'hello',
                    'How',
                    'are you?',
                    'Set-Cookie',
                    'hello; domain=my.domain; path=/',
                    'Set-Cookie',
                    'there; domain=my.domain; path=/',
                ],
            };
            testContext.res = {
                setHeader: function (k, v) {
                    // https://nodejs.org/api/http.html#http_message_headers
                    // Header names are lower-cased
                    this.headers[k.toLowerCase()] = v;
                },
                headers: {},
            };
        });

        it('writes headers', () => {
            const options = {};
            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers.hey).toEqual('hello');
            expect(testContext.res.headers.how).toEqual('are you?');

            expect(testContext.res.headers).toHaveProperty('set-cookie');
            expect(testContext.res.headers['set-cookie']).toBeInstanceOf(Array);
            expect(testContext.res.headers['set-cookie']).toHaveLength(2);
        });

        it('writes raw headers', () => {
            const options = {};
            writeHeaders({}, testContext.res, testContext.rawProxyRes, options);

            expect(testContext.res.headers.hey).toEqual('hello');
            expect(testContext.res.headers.how).toEqual('are you?');

            expect(testContext.res.headers).toHaveProperty('set-cookie');
            expect(testContext.res.headers['set-cookie']).toBeInstanceOf(Array);
            expect(testContext.res.headers['set-cookie']).toHaveLength(2);
        });

        it('rewrites path', () => {
            const options = {
                cookiePathRewrite: '/dummyPath',
            };

            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain(
                'hello; domain=my.domain; path=/dummyPath',
            );
        });

        it('does not rewrite path', () => {
            const options = {};

            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain(
                'hello; domain=my.domain; path=/',
            );
        });

        it('removes path', () => {
            const options = {
                cookiePathRewrite: '',
            };

            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain(
                'hello; domain=my.domain',
            );
        });

        it('does not rewrite domain', () => {
            const options = {};

            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain(
                'hello; domain=my.domain; path=/',
            );
        });

        it('rewrites domain', () => {
            const options = {
                cookieDomainRewrite: 'my.new.domain',
            };

            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain(
                'hello; domain=my.new.domain; path=/',
            );
        });

        it('removes domain', () => {
            const options = {
                cookieDomainRewrite: '',
            };

            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain('hello; path=/');
        });

        it('rewrites headers with advanced configuration', () => {
            const options = {
                cookieDomainRewrite: {
                    '*': '',
                    'my.old.domain': 'my.new.domain',
                    'my.special.domain': 'my.special.domain',
                },
            };
            testContext.proxyRes.headers['set-cookie'] = [
                'hello-on-my.domain; domain=my.domain; path=/',
                'hello-on-my.old.domain; domain=my.old.domain; path=/',
                'hello-on-my.special.domain; domain=my.special.domain; path=/',
            ];
            writeHeaders({}, testContext.res, testContext.proxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain(
                'hello-on-my.domain; path=/',
            );
            expect(testContext.res.headers['set-cookie']).toContain(
                'hello-on-my.old.domain; domain=my.new.domain; path=/',
            );
            expect(testContext.res.headers['set-cookie']).toContain(
                'hello-on-my.special.domain; domain=my.special.domain; path=/',
            );
        });

        it('rewrites raw headers with advanced configuration', () => {
            const options = {
                cookieDomainRewrite: {
                    '*': '',
                    'my.old.domain': 'my.new.domain',
                    'my.special.domain': 'my.special.domain',
                },
            };
            testContext.rawProxyRes.headers['set-cookie'] = [
                'hello-on-my.domain; domain=my.domain; path=/',
                'hello-on-my.old.domain; domain=my.old.domain; path=/',
                'hello-on-my.special.domain; domain=my.special.domain; path=/',
            ];
            testContext.rawProxyRes.rawHeaders =
                testContext.rawProxyRes.rawHeaders.concat([
                    'Set-Cookie',
                    'hello-on-my.domain; domain=my.domain; path=/',
                    'Set-Cookie',
                    'hello-on-my.old.domain; domain=my.old.domain; path=/',
                    'Set-Cookie',
                    'hello-on-my.special.domain; domain=my.special.domain; path=/',
                ]);
            writeHeaders({}, testContext.res, testContext.rawProxyRes, options);

            expect(testContext.res.headers['set-cookie']).toContain(
                'hello-on-my.domain; path=/',
            );
            expect(testContext.res.headers['set-cookie']).toContain(
                'hello-on-my.old.domain; domain=my.new.domain; path=/',
            );
            expect(testContext.res.headers['set-cookie']).toContain(
                'hello-on-my.special.domain; domain=my.special.domain; path=/',
            );
        });
    });

    describe('#attachOutgoingHeaders', function () {
        it('should add outgoing headers', () => {
            const proxyRes = {
                headers: {
                    hey: 'hello',
                    how: 'are you?'
                }
            };

            const res = {
                setHeader: function (k, v) {
                    this.headers[k] = v;
                },
                headers: {}
            };

            attachOutgoingHeaders({}, res, proxyRes, { outgoingHeaders: { billy: 'sally' } });

            expect(res.headers.hey).toBeUndefined();
            expect(res.headers.how).toBeUndefined();
            expect(res.headers.billy).toEqual('sally');
        });
    });

    describe('#removeChunked', () => {
        it('removes transfer-encoding header', () => {
            const proxyRes = {
                headers: {
                    'transfer-encoding': 'hello',
                },
            };

            removeChunked({ httpVersion: '1.0' }, {}, proxyRes);

            expect(proxyRes.headers['transfer-encoding']).toEqual(undefined);
        });
    });

    describe("#chunkedHeader", function () {
        it('flushes chunked response header', () => {
            const proxyRes = {
                headers: {
                    'transfer-encoding': 'chunked',
                },
            };
            let b = false;
            const res = {
                flushHeaders: () => {
                    b = true;
                },
            };

            chunkedResponse({}, res, proxyRes);

            expect(b).toEqual(true);
        })
    });
});
