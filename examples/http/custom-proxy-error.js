/*
  custom-proxy-error.js: Example of using the custom `proxyError` event.

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

import { createServer } from '../../src/index';
import { getPort, setServers } from '../helpers/port'

const targetPort = getPort();
const proxyPort = getPort();
//
// Http Proxy Server with bad target
//
const proxy = createServer({
    target: 'http://localhost:' + targetPort,
});

//
// Tell the proxy to listen on port 8000
//
proxy.listen(proxyPort);

//
// Listen for the `error` event on `proxy`.
proxy.on('error', function (err, req, res) {
    res.writeHead(500, {
        'Content-Type': 'text/plain',
    });

    res.end('Something went wrong. And we are reporting a custom error message.');
});

setServers(proxy)

console.log(
    'http proxy server started on port ' +
    proxyPort +
    ' with custom error message',
);
