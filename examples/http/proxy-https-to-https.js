/*
  proxy-https-to-https.js: Basic example of proxying over HTTPS to a target HTTPS server

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

import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer as _createServer } from '../../src/index'
const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures')
const httpsOpts = {
    key: readFileSync(join(fixturesDir, 'agent2-key.pem'), 'utf8'),
    cert: readFileSync(join(fixturesDir, 'agent2-cert.pem'), 'utf8'),
};
import { getPort } from '../helpers/port'

const proxyPort = getPort();
const targetPort = getPort();
//
// Create the target HTTPS server
//
const server = createServer(httpsOpts, function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('hello https\n');
    res.end();
}).listen(targetPort);

//
// Create the proxy server listening on port 8010
//
const proxy = _createServer({
    ssl: httpsOpts,
    target: 'https://localhost:' + targetPort,
    secure: false,
}).listen(proxyPort);

console.log('https proxy server started on port ' + proxyPort);
console.log('https server started on port ' + targetPort);
