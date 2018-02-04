const http = require('http');
const SSEServer = require('../types/sse-server');
const SSEConnectionDescription = require('../types/sse-connection-description');

/**
 * @param {number} port
 * @param {boolean | sseServerCb} sendHeadersToResponseBeforeRegister
 * @param {sseServerCb} [cb]
 */
exports.createSSEServer = function createSSEServer(port, sendHeadersToResponseBeforeRegister, cb) {
  if (typeof sendHeadersToResponseBeforeRegister === 'function') {
    cb = sendHeadersToResponseBeforeRegister;
    sendHeadersToResponseBeforeRegister = false;
  }
  
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
    if (!sendHeadersToResponseBeforeRegister) {
      return sseServer.sseService.register(request, response);
    }
    response.write('data', err => {
      if (err) return cb(err);
      sseServer.sseService.register(request, response);
    });
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