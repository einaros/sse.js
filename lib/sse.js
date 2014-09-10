var Options = require('options')
  , util = require('util')
  , url = require('url')
  , querystring = require('querystring')
  , events = require('events')
  , SSEClient = require('./sseclient');

module.exports = SSE;
module.exports.Client = SSEClient;

function SSE(httpServer, options) {
  options = new Options({
    path          : '/sse',
    verifyRequest : null
  }).merge(options);
  this.server = httpServer;
  var oldListeners = this.server.listeners('request');
  this.server.removeAllListeners('request');
  var self = this;
  this.server.on('request', function(req, res) {
    var u = url.parse(req.url);
    var pathname = u.pathname.replace(/^\/{2,}/, '/');
    if (pathname == options.value.path && (options.value.verifyRequest == null || options.value.verifyRequest(req))) {
      self.handleRequest(req, res, u.query);
    }
    else {
      for (var i = 0, l = oldListeners.length; i < l; ++i) {
        oldListeners[i].call(self.server, req, res);
      }
    }
  });
}

util.inherits(SSE, events.EventEmitter);

SSE.prototype.handleRequest = function(req, res, query) {
  var client = new SSEClient(req, res);
  client.initialize();
  this.emit('connection', client, querystring.parse(query));
}
