exports.HEARTBEAT_INTERVAL = 15;
exports.SSE_HTTP_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no'
};
