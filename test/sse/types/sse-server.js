const http = require('http');
const Server = http.Server;
const ServerResponse = http.ServerResponse;
const IncomingMessage = http.IncomingMessage;
const async = require('async');

class SSEServer {
  /**
   * @param {Server} httpServer
   */
  constructor(httpServer) {
    this.httpServer = httpServer;
    this.sseService = null;
    this.sseConnections = {/* [requestId]: SSEConnectionDescription */};
    this.closing = false;
  }
  
  /**
   * @param {function} cb
   */
  close(cb) {
    this.closing = true;
    this.cleanConnections(err => {
      if (err) return cb(err);
      this.httpServer.close(err => {
        if (err) return cb(err);
        cb();
      });
    })
  }
  
  /**
   * @param {SSEService} sseService
   * @returns {SSEService}
   */
  setSSEService(sseService) {
    this.sseService = sseService;
    return sseService;
  }
  
  /**
   * @param {number|string} requestId
   * @returns {IncomingMessage}
   */
  getClientResponse(requestId) {
    return this.sseConnections[requestId].clientResponse;
  }
  
  /**
   * @param {number|string} requestId
   * @returns {ServerResponse}
   */
  getServerResponse(requestId) {
    return this.sseConnections[requestId].serverResponse;
  }
  
  endClientResponseIfAny(requestId) {
    const clientResponse = this.getClientResponse(requestId);
    if (clientResponse)
      clientResponse.socket.end();
  }
  
  endServerResponse(requestId, cb) {
    const serverResponse = this.getServerResponse(requestId);
    if (serverResponse && !serverResponse.finished && !serverResponse.socket.destroyed)
      serverResponse.end(cb);
    else process.nextTick(cb);
  }
  
  /**
   * @param {function} cb
   */
  cleanConnections(cb) {
    const requestIds = Object.getOwnPropertyNames(this.sseConnections);
    const closeRequests = requestIds.map(requestId => {
      return _cb => {
        this.endClientResponseIfAny(requestId);
        this.endServerResponse(requestId, _cb);
      }
    });
    
    const closeSSEService = err => {
      if (err) return cb(err);
      if (this.sseService === null) return cb();
      // caveat of encapsulation : test implementation relies on the the sseService to clear the setInterval
      this.sseService.close(() => {
        requestIds.forEach(requestId => delete this.sseConnections[requestId]);
        cb();
      });
      this.sseService = null;
    };
    
    async.parallel(closeRequests, closeSSEService);
  }
}

module.exports = SSEServer;