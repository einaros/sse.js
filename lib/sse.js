var Options = require('options'),
    util = require('util'),
    url = require('url'),
    querystring = require('querystring'),
    events = require('events'),
    SSEClient = require('./sseclient');

module.exports = SSE;
module.exports.Client = SSEClient;

function SSE(httpServer, options) {
    options = new Options({
        path: '/sse',
        verifyRequest: null,
        CORS: false,
    }).merge(options);
    this.server = httpServer;
    var oldListeners = this.server.listeners('request');
    this.server.removeAllListeners('request');
    var self = this;
    this.server.on('request', function(req, res) {
        var u = url.parse(req.url);
        if (u.pathname == options.value.path && (options.value.verifyRequest == null || options.value.verifyRequest(req))) {
            if (options.value.CORS) {
                res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
            }
            self.handleRequest(req, res, u.query);
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
