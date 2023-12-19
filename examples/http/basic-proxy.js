/*
  basic-proxy.js: Basic example of proxying over HTTP

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
import { getPort, setServers } from '../helpers/port'

const welcome = [
    '#    # ##### ##### #####        #####  #####   ####  #    # #   #',
    '#    #   #     #   #    #       #    # #    # #    #  #  #   # # ',
    '######   #     #   #    # ##### #    # #    # #    #   ##     #  ',
    '#    #   #     #   #####        #####  #####  #    #   ##     #  ',
    '#    #   #     #   #            #      #   #  #    #  #  #    #  ',
    '#    #   #     #   #            #      #    #  ####  #    #   #  ',
].join('\n');

console.log(welcome);

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
const server = http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write(
        'request successfully proxied to: ' +
        req.url +
        '\n' +
        JSON.stringify(req.headers, true, 2),
    );
    res.end();
}).listen(targetPort);

setServers(proxy, server)

console.log('http proxy server started on port ' + proxyPort);
console.log('http server started on port ' + targetPort);
