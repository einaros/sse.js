var http          = require('http'),
express           = require('express'),
sse               = require('../../'),
app               = express(),
port              = process.argv[2] ? process.argv[2] : 8080,
docRoot           = './public';

app.use(express.static(docRoot));

var httpServer = http.createServer(app);
var sseServer = new sse(httpServer);

sseServer.on('connection', function(client) {

  var id = setInterval(function() {
    client.send(JSON.stringify(process.memoryUsage()));
  }, 100);

  console.log('started client interval');

  client.on('close', function() {
    console.log('stopping client interval');
    clearInterval(id);
  })

});

httpServer.listen(port, function() {
  console.log("http://localhost:%d is listening...", port)
});
