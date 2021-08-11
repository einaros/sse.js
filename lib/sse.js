var Options = require('options')
  , util = require('util')
  , url = require('url')
  , querystring = require('querystring')
  , events = require('events')
  , SSEClient = require('./sseclient');

RegExp.quote = function(str) {
  return (str+'').replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
};

module.exports = SSE;
module.exports.Client = SSEClient;

function SSE(httpServer, options) {
  options = new Options({
    path          : '/sse',
    verifyRequest : null,
    verifyRequestPromise: null
  }).merge(options);
  this.server = httpServer;
  var oldListeners = this.server.listeners('request');
  this.server.removeAllListeners('request');
  var self = this;
  this.server.on('request', function(req, res) {
    var u = url.parse(req.url);
    var pathname = u.pathname.replace(/^\/{2,}/, '/');
    if (self.matchesPath(pathname, options.value.path)) {
        if (options.value.verifyRequestPromise == null) {
            if (options.value.verifyRequest == null || options.value.verifyRequest(req)) {
               self.handleRequest(req, res, u.query);
            } else {
               for (var i = 0, l = oldListeners.length; i < l; ++i) {
                  oldListeners[i].call(self.server, req, res);
              }
            }
        } else {
          options.value.verifyRequestPromise(req)
          .then (function () {
             self.handleRequest(req, res, u.query);
          })
          .catch (function (e) {
            for (var i = 0, l = oldListeners.length; i < l; ++i) {
              oldListeners[i].call(self.server, req, res);
             }
          });
        }
    } else {
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

SSE.prototype.matchesPath = function(queryPath, matchPath) {
  var match = RegExp.quote(matchPath).replace('\\*', '.*');
  return RegExp('^' + match + '$').test(queryPath);
}
