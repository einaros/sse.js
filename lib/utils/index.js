const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const { SSE_HTTP_RESPONSE_HEADERS } = require('./constants');
const assert = require('./assert');

/**
 * Validates the HTTP request w.r.t the EventSource specification
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @return {{status: number, message: string} | null}
 */
exports.validateRequestForSSE = function validateRequestForSSE(req, res) {
  assert.instanceOf(req, IncomingMessage);
  assert.instanceOf(res, ServerResponse);
  if (res.headersSent)
    return {
      status: 500,
      message: 'Cannot register a connection with headers already sent'
    };
  if (req.headers['accept'] !== 'text/event-stream')
    return {
      status: 400,
      message:
        'Cannot register connection : The request HTTP header "Accept" is not set to "text/event-stream"'
    };
  return null;
};

/**
 * Sends the status code and headers to the response. Sends an initial payload to flush data.
 * @param {ServerResponse} res
 * @param {function} cb
 */
exports.setupHTTPResponse = function setupHTTPResponse(res, cb) {
  assert.instanceOf(res, ServerResponse);
  try {
    res.writeHead(200, SSE_HTTP_RESPONSE_HEADERS);
  } catch (err) {
    // Events must be emitted asynchronously
    process.nextTick(() => {
      cb(
        exports.wrapError(
          err,
          'Could not send status code and headers',
          'setupHTTPResponseError'
        )
      );
    });
    res.writeHead(500);
    res.end();
    cb(null, false);
    return;
  }

  // Sending empty comment to flush data.
  // Cannot call this.send() because connection is not registered to the service yet.
  res.write(':\n\n', err => {
    if (err) {
      cb(
        exports.wrapError(
          err,
          'Could not send initial heartbeat payload',
          'setupHTTPResponseError'
        )
      );
      return;
    }
    cb(null);
  });
};

/**
 * @param {Error} err
 * @param {string} msg
 * @param {string} [name]
 * @returns {Error}
 */
exports.wrapError = function wrapError(err, msg, name = 'SSEServiceError') {
  err.name = name;
  err.message = `${msg}: ${err.message}`;
  return err;
};
