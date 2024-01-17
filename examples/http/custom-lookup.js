import { createServer } from '../../src/index';
import dns from 'node:dns'

const proxy = createServer({
    target: 'http://example.com:80',
    changeHost: true,

    // Define custom dns lookup function
    lookup: function (host, options, callback) {
        console.log('Looking up', host);

        dns.lookup(host, options, function (err, address, family) {
            console.log('Result: err:', err, ', address:', address, 'family:', family);

            callback(err, address, family);
        });
    },
}).listen(8003);

console.log('http proxy server started on port: 8003');