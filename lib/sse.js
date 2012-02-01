var Options = require('options')
  , util = require('util')
  , events = require('events')
  , SSEClient = require('./sseclient');

function SSE(httpServer, options) {
  options = new Options({
    path: '/sse',
    verifyRequest: null
  }).merge(options);
  this.server = httpServer;
  var oldListeners = this.server.listeners('request');
  this.server.removeAllListeners('request');
  var self = this;
  this.server.on('request', function(req, res) {
    if (req.url == options.value.path && 
        (options.value.verifyRequest == null || options.value.verifyRequest(req))) {
      self.handleRequest(req, res);
    }
    else {
      for (var i = 0, l = oldListeners.length; i < l; ++i) {
        oldListeners[i].call(self.server, req, res);
      }
    }
  });
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(SSE, events.EventEmitter);

SSE.prototype.handleRequest = function(req, res) {
  req.socket.setNoDelay(true);
  res.writeHead(200, {'Content-Type': 'text/event-stream'});
  res.write(':ok\n\n');
  this.emit('connection', new SSEClient(req, res));
}

module.exports = SSE;