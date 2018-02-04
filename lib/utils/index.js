const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const assert = require('./assert');

/**
 * @param {function[]} fns
 * @return {function}
 */
exports.composeDownstream = function composeDownstream(fns) {
  return fns.reduce((acc, fn) => x => fn(acc(x)), x => x);
};

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
