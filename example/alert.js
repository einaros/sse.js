var SSE = require('../')
  , http = require('http');

var server = http.createServer(function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end('<script>var es = new EventSource("/sse"); es.onmessage = function (event) { alert(event.data); };</script>');
});

server.listen(8080, '127.0.0.1', function() {
  var sse = new SSE(server);
  sse.on('connection', function(client) {
    client.send('hi there!');
  });
});
