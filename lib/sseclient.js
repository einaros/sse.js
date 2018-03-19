var util = require('util'),
  events = require('events');

module.exports = SSEClient;


/**
 * @param {http.ClientRequest}  req
 * @param {http.ServerResponse} res
 * @param {Object} options
 * @param {Object} options.headers: Extra headers to add to the SSE response.
 *                 The defaults are: {
 *                   'Content-Type': 'text/event-stream',
 *                   'Cache-Control': 'no-cache, no-transform',
 *                   'Connection': 'keep-alive'
 *                 }
 *                 Anything passed in options.headers will be merged over the defaults.
 *
 * @constructor
 */
function SSEClient(req, res, options) {
  this.req = req;
  this.res = res;
  this.options = options;
  var self = this;
  res.on('close', function () {
    self.emit('close');
  });
}

util.inherits(SSEClient, events.EventEmitter);

SSEClient.prototype.initialize = function () {
  this.req.socket.setNoDelay(true);

  // Merge extra headers with default ones.
  var headers = Object.assign({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  },
    this.options.headers
  );

  this.res.writeHead(200, headers);
  this.res.write(':ok\n\n');
};

SSEClient.prototype.send = function (event, data, id) {
  if (arguments.length === 0) return;

  var senderObject = {
    event: event || undefined,
    data: data || undefined,
    id: id || undefined,
    retry: undefined
  };

  if (typeof event == 'object') {
    senderObject.event = event.event || undefined,
      senderObject.data = event.data || undefined,
      senderObject.id = event.id || undefined,
      senderObject.retry = event.retry || undefined
  }

  if (typeof event != 'object' && arguments.length === 1) {
    senderObject.event = undefined;
    senderObject.data = event;
  }

  if (senderObject.event) this.res.write('event: ' + senderObject.event + '\n');
  if (senderObject.retry) this.res.write('retry: ' + senderObject.retry + '\n');
  if (senderObject.id) this.res.write('id: ' + senderObject.id + '\n');

  senderObject.data = senderObject.data.replace(/(\r\n|\r|\n)/g, '\n');
  var dataLines = senderObject.data.split(/\n/);

  for (var i = 0, l = dataLines.length; i < l; ++i) {
    var line = dataLines[i];
    if ((i + 1) === l) this.res.write('data: ' + line + '\n\n');
    else this.res.write('data: ' + line + '\n');
  }
}

SSEClient.prototype.close = function () {
  this.res.end();
}
