var Options = require('options');

function SSE(httpServer, options) {
  options = new Options({
    path: '/sse'
  }).merge(options);
  this.server = httpServer;
  var oldListeners = this.server.listeners('request');
  this.server.removeAllListeners('request');
  var self = this;
  this.server.on('request', function(req, res) {
    if (req.url == options.value.path) {
      self.handleRequest(req, res);
    }
    else {
      for (var i = 0, l = oldListeners.length; i < l; ++i) {
        oldListeners[i].call(self.server, req, res);
      }
    }
  });
}

SSE.prototype.handleRequest = function(req, res) {
  res.end('yay');
}

module.exports = SSE;