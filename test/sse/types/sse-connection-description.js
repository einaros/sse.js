const http = require('http');
const ServerResponse = http.ServerResponse;
const IncomingMessage = http.IncomingMessage;

class SSEConnectionDescription {
  
  /**
   * @param {ServerResponse} serverResponse
   */
  constructor(serverResponse) {
    this._clientResponse = null;
    this._serverResponse = serverResponse;
  }
  
  /**
   * @returns {IncomingMessage}
   */
  get clientResponse() {
    return this._clientResponse;
  }
  
  /**
   * @returns {ServerResponse}
   */
  get serverResponse() {
    return this._serverResponse;
  }
}

module.exports = SSEConnectionDescription;