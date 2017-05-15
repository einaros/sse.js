# sse.js: a server-sent events implementation for node.js #

The HTML5 Server-Sent events specification is introduced "to enable servers to push data to Web pages over HTTP or using dedicated server-push protocols".

The spec can be found [here](https://html.spec.whatwg.org/multipage/comms.html#server-sent-events).

## Usage ##

### Installing ###

`npm install sse`

### Basic server ###

```js
var SSE = require('sse')
  , http = require('http');

var server = http.createServer(function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('okay');
});

server.listen(8080, '127.0.0.1', function() {
  var sse = new SSE(server);
  sse.on('connection', function(client) {
    client.send('hi there!');
  });
});
```

Client code for the above server:

```js
var es = new EventSource("/sse");
es.onmessage = function (event) {
  console.log(event.data);
};
```

## License ##

(The MIT License)

Copyright (c) 2011 Einar Otto Stangvik &lt;einaros@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
