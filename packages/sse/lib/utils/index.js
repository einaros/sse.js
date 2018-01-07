const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const assert = require('./assert');

/**
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
