const SSEService = require('./lib/sse-service');
const sseEventSourcePolyfillMiddleware = require('./lib/middlewares/event-source-polyfill');

exports.SSEService = SSEService;
exports.middlewares = {
  sseEventSourcePolyfillMiddleware
};