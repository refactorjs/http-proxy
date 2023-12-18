import { checkMethodAndHeader, XHeaders } from '../src/proxy/passes/ws.incoming';
import { describe, expect, it } from 'vitest';

describe('src/proxy/passes/ws.incoming.ts', () => {
    describe('#checkMethodAndHeader', () => {
        it('should drop non-GET connections', () => {
            let destroyCalled = false,
                stubRequest = {
                    method: 'DELETE',
                    headers: {},
                },
                stubSocket = {
                    destroy: function () {
                        // Simulate Socket.destroy() method when call
                        destroyCalled = true;
                    },
                };
            const returnValue = checkMethodAndHeader(stubRequest, stubSocket);
            expect(returnValue).toBe(true);
            expect(destroyCalled).toBe(true);
        });

        it('should drop connections when no upgrade header', () => {
            let destroyCalled = false,
                stubRequest = {
                    method: 'GET',
                    headers: {},
                },
                stubSocket = {
                    destroy: function () {
                        // Simulate Socket.destroy() method when call
                        destroyCalled = true;
                    },
                };
            const returnValue = checkMethodAndHeader(stubRequest, stubSocket);
            expect(returnValue).toBe(true);
            expect(destroyCalled).toBe(true);
        });

        it('should drop connections when upgrade header is different of `websocket`', () => {
            let destroyCalled = false,
                stubRequest = {
                    method: 'GET',
                    headers: {
                        upgrade: 'anotherprotocol',
                    },
                },
                stubSocket = {
                    destroy: function () {
                        // Simulate Socket.destroy() method when call
                        destroyCalled = true;
                    },
                };
            const returnValue = checkMethodAndHeader(stubRequest, stubSocket);
            expect(returnValue).toBe(true);
            expect(destroyCalled).toBe(true);
        });

        it('should return nothing when all is ok', () => {
            let destroyCalled = false,
                stubRequest = {
                    method: 'GET',
                    headers: {
                        upgrade: 'websocket',
                    },
                },
                stubSocket = {
                    destroy: function () {
                        // Simulate Socket.destroy() method when call
                        destroyCalled = true;
                    },
                };
            const returnValue = checkMethodAndHeader(stubRequest, stubSocket);
            expect(returnValue).toBe(undefined);
            expect(destroyCalled).toBe(false);
        });
    });

    describe('#XHeaders', () => {
        it('return if no forward request', () => {
            const returnValue = XHeaders({}, {}, {});
            expect(returnValue).toBe(undefined);
        });

        it('set the correct x-forwarded-* headers from req.socket', () => {
            const stubRequest = {
                socket: {
                    remoteAddress: '192.168.1.2',
                    remotePort: '8080',
                },
                headers: {
                    host: '192.168.1.2:8080',
                },
            };
            XHeaders(stubRequest, {}, { xfwd: true });

            expect(stubRequest.headers['X-Forwarded-For']).toBe('192.168.1.2');
            expect(stubRequest.headers['X-Forwarded-Port']).toBe('8080');
            expect(stubRequest.headers['X-Forwarded-Proto']).toBe('ws');
        });

        it('set the correct x-forwarded-* headers from req.socket', () => {
            const stubRequest = {
                socket: {
                    remoteAddress: '192.168.1.3',
                    remotePort: '8181',
                    encrypted: true
                },
                headers: {
                    host: '192.168.1.3:8181',
                },
            };
            XHeaders(stubRequest, {}, { xfwd: true });
            expect(stubRequest.headers['X-Forwarded-For']).toBe('192.168.1.3');
            expect(stubRequest.headers['X-Forwarded-Port']).toBe('8181');
            // This won't work because Xheaders expects the socket to be an
            // instance of TLSSocket which is only available with an ssl cert
            // for encryption
            //expect(stubRequest.headers['x-forwarded-proto']).toBe('wss');
        });
    });
});
