var SSE = require('../../')
  , express = require('express')
  , app = express.createServer();

app.use(express.static(__dirname + '/public'));

var sse = new SSE(app);
sse.on('connection', function(client) {
  var id = setInterval(function() {
    client.send(JSON.stringify(process.memoryUsage()));
  }, 100);
  console.log('started client interval');
  client.on('close', function() {
    console.log('stopping client interval');
    clearInterval(id);
  })
});

app.listen(8080);
