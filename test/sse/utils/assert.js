const assert = require('chai').assert;

const expectedHttpResponseHeaders = {
  'content-type': 'text/event-stream',
  'connection': 'keep-alive',
  'cache-control': 'no-cache',
  'x-accel-buffering': 'no'
};
const expectedHttpResponseHeaderFields = Object.getOwnPropertyNames(expectedHttpResponseHeaders);

exports.verifyResponseStatusCodeAndHeaders = function verifyResponseStatusCodeAndHeaders(clientResponse) {
  assert.strictEqual(clientResponse.statusCode, 200);
  const responseHeaderFields = Object.getOwnPropertyNames(clientResponse.headers);
  const relevantResponseHeaderFields = responseHeaderFields.filter(rHf => expectedHttpResponseHeaderFields.includes(rHf.toLowerCase()));
  const missingHeaderFields = expectedHttpResponseHeaderFields.filter(xhF => !responseHeaderFields.some(rHF => rHF.toLowerCase() === xhF));
  assert.strictEqual(
    relevantResponseHeaderFields.length, expectedHttpResponseHeaderFields.length,
    `Missing mandatory headers to the HTTP response : ${JSON.stringify(missingHeaderFields)}`
  );
  responseHeaderFields.forEach(headerField => {
    if (expectedHttpResponseHeaders[headerField.toLowerCase()]) {
      assert.strictEqual(clientResponse.headers[headerField], expectedHttpResponseHeaders[headerField], `Unexpected HTTP response header for "${headerField}"`);
    }
  });
};

exports.verifyServerSentEventFormat = function verifyServerSentEventFormat(event, data, cb = null) {
  return chunk => {
    assert.strictEqual(chunk.toString(), `event:${event}\n` + `data:${JSON.stringify(data)}\n\n`);
    if (cb) cb();
  };
};

exports.assertHeartbeat = function assertHeartbeat(chunk){
  assert.equal(`${chunk}`, ':\n\n');
};