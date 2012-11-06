var SSE = require('../')
  , expect = require('expect.js')
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

function request(reqUrl, cb, headers) {
  var uri = url.parse(reqUrl);
  var options = {
    port: uri.port,
    host: uri.hostname,
    path: uri.path
  };
  if (headers) options.headers = headers;
  var req = http.request(options, cb);
  req.end();
  return req;
}

function stripComments(streamData) {
  return streamData.replace(/^:[^\n]*\n\n/g, '');
}

describe('SSE', function() {
  describe('#ctor', function() {
    it('will listen on /sse by default', function(done) {
      var server = listen(++port, function() {
        var sse = new SSE(server);
        sse.on('connection', function(client) {
          server.close();
          done();
        });
        request('http://localhost:' + port + '/sse', function(res) {});
      });
    });

    it('can be configured to listen on a specific path', function(done) {
      var server = listen(++port, function() {
        var sse = new SSE(server, { path: '/something' });
        sse.on('connection', function(client) {
          server.close();
          done();
        });
        request('http://localhost:' + port + '/something', function(res) {});
      });
    });

    it('can be configured to use a custom request verification method to block a request', function(done) {
      var server = listen(++port, function() {
        var sse = new SSE(server, { verifyRequest: function(req) { return false; } });
        request('http://localhost:' + port + '/sse', function(res) {
          var streamData = '';
          res.on('data', function(data) {
            streamData += data.toString('utf8');
          });
          res.on('end', function() {
            expect(streamData).to.equal(defaultServerResponse);
            done();
          });
        });
      });
    });
  });

  describe('emits', function() {
    it('a "connection" event when a client connects', function(done) {
      var server = listen(++port, function() {
        var sse = new SSE(server);
        sse.on('connection', function(client) {
          server.close();
          done();
        });
        request('http://localhost:' + port + '/sse', function(res) {});
      });
    });
  });

  describe('http header', function() {
    it('has content-type set to text/event-stream', function(done) {
      var server = listen(++port, function() {
        var sse = new SSE(server);
        request('http://localhost:' + port + '/sse', function(res) {
          expect(res.headers['content-type']).to.equal('text/event-stream');
          done();
        });
      });
    });
  });

  describe('client', function() {
    it('is exported', function(done) {
      expect(SSE.Client);

      var server = listen(++port, function() {
        var sse = new SSE(server);
        sse.on('connection', function(client) {
          expect(client instanceof SSE.Client);
          client.on('close', function() {
            server.close();
            done();
          });
        });
      });
      request('http://localhost:' + port + '/sse', function(res) {
        res.socket.end();
      });
    });

    describe('emits', function() {
      it('a "close" event when a client connects', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.on('close', function() {
              server.close();
              done();
            });
          });
          request('http://localhost:' + port + '/sse', function(res) {
            res.socket.end();
          });
        });
      });
    });

    describe('#close', function() {
      it('ends the connection', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            res.on('end', function() {
              server.close();
              done();              
            });
          });
        });        
      });
    });
  });
  
  describe('#send', function() {
    describe('with special characters in data', function() {
      it('sends a message with CR over several data directives', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foo\rbar\rbaz');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foo\ndata: bar\ndata: baz\n\n');
              done();
            });
          });
        });
      });

      it('sends a message with LF over several data directives', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foo\nbar\nbaz');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foo\ndata: bar\ndata: baz\n\n');
              done();
            });
          });
        });
      });

      it('sends a message with CRLF over several data directives', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foo\r\nbar\r\nbaz');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foo\ndata: bar\ndata: baz\n\n');
              done();
            });
          });
        });
      });

      it('sends a message with (nonsensical) LFCR over several data directives', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foo\n\rbar\n\rbaz\n\r');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foo\ndata: \ndata: bar\ndata: \ndata: baz\ndata: \ndata: \n\n');
              done();
            });
          });
        });
      });

      it('sends a message witch goes over only one line', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foo');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foo\n\n');
              done();
            });
          });
        });
      });

    });

    describe('first function attribute to send method as object', function() {
      it('passes a object to the first attribute, all other attributes is ignored', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send({data:'foo'}, 'bar');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foo\n\n');
              done();
            });
          });
        });
      });

      it('sends a message with only data value', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send({data:'foo'});
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foo\n\n');
              done();
            });
          });
        });
      });

      it('sends a message with all object values set', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send({data:'foo',event:'bar',id:1,retry:6000});
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('event: bar\nretry: 6000\nid: 1\ndata: foo\n\n');
              done();
            });
          });
        });
      });
    });

    describe('without an event name or id', function() {
      it('sends a message event', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foobar');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('data: foobar\n\n');
              done();
            });
          });
        });
      });
    });

    describe('with custom event name', function() {
      it('sends a foobar event', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foobar', 'somedata');
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('event: foobar\ndata: somedata\n\n');
              done();
            });
          });
        });
      });
    });

    describe('with custom id', function() {
      it('sends a foobar event', function(done) {
        var server = listen(++port, function() {
          var sse = new SSE(server);
          sse.on('connection', function(client) {
            client.send('foobar', 'somedata', 100);
            client.close();
          });
          request('http://localhost:' + port + '/sse', function(res) {
            var streamData = '';
            res.on('data', function(data) {
              streamData += data.toString('utf8');
            });
            res.on('end', function() {
              streamData = stripComments(streamData);
              expect(streamData).to.equal('event: foobar\nid: 100\ndata: somedata\n\n');
              done();
            });
          });
        });
      });
    });

  });
});
