import { createProxy } from '../../src/index';
import { createServer } from 'http';
import { getPort } from '../helpers/port';
import Agent from 'agentkeepalive';

const agent = new Agent({
    maxSockets: 100,
    keepAlive: true,
    maxFreeSockets: 10,
    keepAliveMsecs: 1000,
    timeout: 60000,
    keepAliveTimeout: 30000, // free socket keepalive for 30 seconds
});

const proxy = createProxy({
    target: 'http://whatever.com',
    agent: agent,
});

//
// Modify headers of the response before it gets sent
// So that we handle the NLTM authentication response
//
proxy.on('proxyRes', function (proxyRes) {
    const key = 'www-authenticate';
    proxyRes.headers[key] = proxyRes.headers[key] && proxyRes.headers[key].split(',');
});

createServer(function (req, res) {
    req.headers = req.headers || {};
    req.headers.remotePort = req.socket.remotePort;
    proxy.web(req, res);
}).listen(getPort());
