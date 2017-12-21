const http = require('http');
const SSEServer = require('../types/sse-server');
const SSEConnectionDescription = require('../types/sse-connection-description');

/**
 * @param {number} port
 * @param {sseServerCb} cb
 */
exports.createSSEServer = function createSSEServer(port, cb) {
  let httpServer = null;
  let sseServer = null;
  
  function onHttpServerListening(err) {
    if (err) return cb(err);
    sseServer = new SSEServer(httpServer);
    cb(null, sseServer);
  }
  
  function requestListener(request, response) {
    const requestId = /^\/(\d+)$/.exec(request.url)[1];
    sseServer.sseConnections[requestId] = new SSEConnectionDescription(response);
    sseServer.sseService.register(request, response);
    sseServer.sseService.on('error', err => {
      throw err;
    })
  }
  
  httpServer = http
    .createServer(requestListener)
    .listen(port, onHttpServerListening);
};


/**
 * @callback sseServerCb
 * @param {Error} err
 * @param {SSEServer} [sseServer]
 */