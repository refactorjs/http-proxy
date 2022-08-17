import { createProxy } from '../../src/index';
import { createServer } from 'http';
import { getPort } from '../helpers/port';
import { Agent } from 'http';

class customAgent extends Agent {
    getName(options) {
        return options.headers.remotePort + ':' + super(options);
    }
}

const agent = new customAgent({
    maxSockets: 100,
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxFreeSockets: 10,
    timeout: 60000
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
