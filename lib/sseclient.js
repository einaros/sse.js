var util    = require('util'), 
    events  = require('events');



// Check too see if if a value is an Object

function isObject(value) { 
  return value instanceof Object;
}



function SSEClient(req, res) {
  this.req = req;
  this.res = res;
  var self = this;
  res.on('close', function() {
    self.emit('close');
  });
}



// Inherits from EventEmitter.

util.inherits(SSEClient, events.EventEmitter);

SSEClient.prototype.initialize = function() {
  this.req.socket.setNoDelay(true);
  this.res.writeHead(200, {'Content-Type': 'text/event-stream', 
                           'Cache-Control': 'no-cache', 
                           'Connection': 'keep-alive'
                          });
  this.res.write(':ok\n\n');
};



// Send method

SSEClient.prototype.send = function(event, data, id) {

  if (arguments.length === 0) {
    return;
  }

  var senderObject = {
    event : event || undefined, 
    data  : data || undefined, 
    id    : id || undefined, 
    retry : undefined
  };

  if (isObject(event)) {
    senderObject.event   = event.event || undefined, 
    senderObject.data    = event.data || undefined, 
    senderObject.id      = event.id || undefined, 
    senderObject.retry   = event.retry || undefined
  }

  if (!isObject(event) && arguments.length === 1) {    
    senderObject.event   = undefined;
    senderObject.data    = event;
  }
  

  if (senderObject.event) {
    this.res.write('event:' + senderObject.event + '\n');
  } 

  if (senderObject.retry) {
    this.res.write('retry:' + senderObject.retry + '\n');
  }

  if (senderObject.id) {
    this.res.write('id:' + senderObject.id + '\n');
  } 


  senderObject.data = senderObject.data.replace(/(\r\n|\r|\n)/g, '\n');
  var dataLines = senderObject.data.split(/\n/);

  for (var i = 0, l = dataLines.length; i < l; ++i) {
    var line = dataLines[i];

    if ((l-1) === 0) {
      this.res.write('data: ' + line + '\n\n');
    } else {
      this.res.write('data: ' + line + '\n');
    }
  }

}



// Close method

SSEClient.prototype.close = function() {
  this.res.end();
}

module.exports = SSEClient;