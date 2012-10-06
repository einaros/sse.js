var util = require('util')
  , events = require('events');

function SSEClient(req, res) {
  this.req = req;
  this.res = res;
  this.isLegacy = req.headers['user-agent'] && (/^Opera[^\/]*\/9/).test(req.headers['user-agent']);
  var self = this;
  res.on('close', function() {
    self.emit('close');
  });
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(SSEClient, events.EventEmitter);

SSEClient.prototype.initialize = function() {
  this.req.socket.setNoDelay(true);
  if (this.isLegacy) {
    this.res.writeHead(200, {'Content-Type': 'text/x-dom-event-stream'});
  }
  else this.res.writeHead(200, {'Content-Type': 'text/event-stream'});
  this.res.write(':ok\n\n');
};

SSEClient.prototype.send = function(event, data, id) {
  if (arguments.length == 0) return;
  if (arguments.length == 1) {
    data = event;
    event = null;
  }
  if (this.isLegacy) {
    this.res.write('Event: data\n');
  }
  else {
    if (typeof event !== 'undefined' && event !== null) this.res.write('event:' + event + '\n');
    if (typeof id !== 'undefined' && event !== null) this.res.write('id:' + id + '\n');
  }
  data = data.replace(/(\r\n|\r|\n)/g, '\n');
  var dataLines = data.split(/\n/);
  for (var i = 0, l = dataLines.length; i < l; ++i) {
    var line = dataLines[i];
    this.res.write('data:' + (this.isLegacy ? ' ' : '') + line + '\n');
  }
  this.res.write('\n');
}

SSEClient.prototype.close = function() {
  this.res.end();
}

module.exports = SSEClient;