const http = require('http');
const async = require('async');

let requestIdCounter = 0;

exports.resetRequestIdCounter = function resetRequestIdCounter() {
  requestIdCounter = 0;
};

/**
 * @param {SSEServer} sseServer
 * @param {Object | requestIdCb} headers
 * @param {requestIdCb} [cb]
 */
exports.simulateSSEConnection = function simulateSSEConnection(sseServer, headers = {}, cb = () => null) {
  if (typeof headers === 'function') {
    cb = headers;
    headers = {};
  }
  const requestId = ++requestIdCounter + '';
  const options = {
    hostname: 'localhost',
    port: sseServer.httpServer.address().port,
    path: `/${requestId}`,
    method: 'GET',
    headers: Object.assign({accept: 'text/event-stream'}, headers)
  };
  
  const req = http.request(options, res => {
    if (!sseServer.closing) {
      sseServer.sseConnections[requestId]._clientResponse = res;
      cb(null, requestId);
    } else
      res.destroy(); // Otherwise the httpServer will hang on close()
  });
  
  req.on('error', cb);
  req.end();
};

/**
 * @param {SSEServer} sseServer
 * @param {number} nbClientRequests
 * @param {function} cb
 */
exports.simulateSSEConnections = function simulateSSEConnections(sseServer, nbClientRequests, cb) {
  const arr = new Array(nbClientRequests);
  const _simulateSSEConnection = exports.simulateSSEConnection.bind(null, sseServer);
  async.parallel(arr.fill(_simulateSSEConnection), cb);
};


/**
 * @callback requestIdCb
 * @param {Error} err
 * @param {string} [requestId]
 */