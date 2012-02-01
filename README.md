# sse.js: a server-sent events implementation for node.js #

The HTML5 Server-Sent events specification is introduced "to enable servers to push data to Web pages over HTTP or using dedicated server-push protocols".

The spec can be found [here](http://dev.w3.org/html5/eventsource/).

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
