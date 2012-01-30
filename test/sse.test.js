var SSE = require('../')
  , expect = require('expect')
  , http = require('http')
  , url = require('url')
  , port = 20000
  , defaultServerResponse = 'http server response';

function listen(port, cb) {
  var server = http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(defaultServerResponse);
  });
  server.listen(port, '127.0.0.1', cb);
  return server;
}

function request(reqUrl, cb) {
  var uri = url.parse(reqUrl);
  var options = {
    port: uri.port,
    host: uri.hostname,
    path: uri.path
  };
  var req = http.request(options, cb);
  req.end();
  return req;
}

describe('SSE', function() {

  describe('#ctor', function() {

    it('will listen on /sse by default', function(done) {
      var server = listen(++port, function() {
        var sse = new SSE(server);
        request('http://localhost:' + port + '/sse', function(res) {
          var allData = '';
          res.on('data', function(data) {
            allData += data.toString('utf8');
          })
          res.on('end', function() {
            expect(allData).not.to.equal(defaultServerResponse);
            done();
          })
        });
      });
    });

    it('can be configured to listen on a specific path', function(done) {
      var server = listen(++port, function() {
        var sse = new SSE(server, { path: '/something' });
        request('http://localhost:' + port + '/something', function(res) {
          var allData = '';
          res.on('data', function(data) {
            allData += data.toString('utf8');
          })
          res.on('end', function() {
            expect(allData).not.to.equal(defaultServerResponse);
            done();
          })
        });
      });
    });

  });
});
