/*
  concurrent-proxy.js: check levelof concurrency through proxy.

  Copyright (c) 2013 - 2016 Charlie Robbins, Jarrett Cruger & the Contributors.

  Permission is hereby granted, free of charge, to any person obtaining
  a copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
  LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
  WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
import http from 'node:http';
import { createServer } from '../../src/index';
import { getPort } from '../helpers/port'

const targetPort = getPort();
const proxyPort = getPort();
//
// Basic Http Proxy Server
//
const proxy = createServer({
    target: 'http://localhost:' + targetPort,
}).listen(proxyPort);

//
// Target Http Server
//
// to check apparent problems with concurrent connections
// make a server which only responds when there is a given number on connections
//

const connections = [];
let go;

const server = http.createServer(function (req, res) {
    connections.push(function () {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(
            'request successfully proxied to: ' +
            req.url +
            '\n' +
            JSON.stringify(req.headers, true, 2),
        );
        res.end();
    });

    process.stdout.write(connections.length + ', ');

    if (connections.length > 110 || go) {
        go = true;
        while (connections.length) {
            connections.shift()();
        }
    }
}).listen(targetPort);

console.log('http proxy server started on port ' + proxyPort);
console.log('http server started on port ' + targetPort);
