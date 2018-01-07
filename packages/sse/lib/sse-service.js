const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const EventEmitter = require('events');
const uuidv4 = require('uuid/v4');
const async = require('async');
const validateRequestForSSE = require('./utils').validateRequestForSSE;
const assert = require('./utils/assert');
const { isSet, maybeFn } = require('./utils/maybe');
const { createSSEIDClass } = require('./sse-id');

const internal = require('./utils/weak-map').getInternal();

const HEARTBEAT_INTERVAL = 15;
const SSE_HTTP_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no'
};

class SSEService extends EventEmitter {
  constructor() {
    super();

    const internals = internal(this);
    internals.secureId = uuidv4();
    internals.SSEID = createSSEIDClass(internals.secureId);
    internals.activeSSEConnections = new Map();
    internals.blockIncomingConnections = false;

    // Keeping connection alive by periodically sending comments (https://www.w3.org/TR/eventsource/#notes)
    internals.heartbeatIntervalId = setInterval(() => {
      this.send({ comment: '' });
    }, HEARTBEAT_INTERVAL * 1000).unref();

    // Allowing method to be used as a standalone function
    this.register = this.register.bind(this);

    // Private methods, not to be exposed publicly
    internals.applyForTarget = _applyForTarget.bind(this);
    internals.unregisterFn = _unregisterFn.bind(this);
    internals.getSSEIdFromResponse = _getSSEIdFromResponse.bind(this);
  }

  /** @returns {function} */
  get SSEID() {
    return internal(this).SSEID;
  }

  /** @returns {number} */
  get numActiveConnections() {
    return internal(this).activeSSEConnections.size;
  }

  /**
   * @param {SSEID} sseId
   * @returns {boolean}
   */
  isConnectionActive(sseId) {
    assert.instanceOf(sseId, internal(this).SSEID);
    return internal(this).activeSSEConnections.has(sseId);
  }

  /**
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   */
  register(req, res) {
    assert.instanceOf(req, IncomingMessage);
    assert.instanceOf(res, ServerResponse);

    if (internal(this).blockIncomingConnections) {
      // Preventing reconnection with status code 204 (https://www.w3.org/TR/eventsource/#server-sent-events-intro)
      res.writeHead(204);
      res.end();
      return;
    }

    const validationError = validateRequestForSSE(req, res);
    if (validationError !== null) {
      res.writeHead(validationError.status);
      res.end(JSON.stringify({ error: validationError.message }));
      return;
    }

    const { activeSSEConnections, SSEID, secureId } = internal(this);

    // Not registering a connection that has already been registered
    if (internal(this).getSSEIdFromResponse(res) !== null) {
      return;
    }

    try {
      res.writeHead(200, SSE_HTTP_RESPONSE_HEADERS);
    } catch (e) {
      // Events must be emitted asynchronously
      process.nextTick(() => {
        this.emit('error', wrapError(e, 'Could not register connection'));
      });
      res.writeHead(500);
      res.end();
      return;
    }

    // Sending empty comment to flush data.
    // Cannot call this.send() because connection is not registered to the service yet.
    res.write(':\n\n', err => {
      if (err) {
        this.emit(
          'error',
          wrapError(err, 'Could not send initial heartbeat payload')
        );
        return;
      }

      if (!res.hasOwnProperty('locals'))
        Object.defineProperty(res, 'locals', { value: {} });
      const sseId = new SSEID(secureId, req, res);
      res.on('close', () =>
        this.unregister(sseId, () => this.emit('clientClose', sseId))
      );
      res.on('finish', () => this.unregister(sseId));
      activeSSEConnections.set(sseId, res);
      internal(res).sseId = sseId;
      this.emit('connection', sseId);
    });
  }

  unregister(target, cb) {
    internal(this).applyForTarget(internal(this).unregisterFn, target, cb);
  }

  /**
   * @param {Function} cb
   */
  close(cb) {
    internal(this).blockIncomingConnections = true;
    if (internal(this).heartbeatIntervalId)
      clearInterval(internal(this).heartbeatIntervalId);
    this.unregister(null, cb);
  }

  /**
   * @param {Object | string} opts
   * @param {*} [opts.data]
   * @param {string} [opts.event]
   * @param {string} [opts.id]
   * @param {number} [opts.retry]
   * @param {string} [opts.comment]
   * @param {Object|function} [target]
   * @param {function} [cb]
   */
  send(opts, target, cb) {
    assert.isObject(opts);

    let msg;
    if (typeof opts === 'string') msg = opts;
    else {
      const { data, event, id, retry, comment } = opts;
      msg =
        (isSet(id) ? `id:${id}\n` : '') +
        (isSet(event) ? `event:${event}\n` : '') +
        (isSet(data) ? `data:${JSON.stringify(data)}\n` : '') +
        (isSet(retry) ? `retry:${retry}\n` : '') +
        (isSet(comment) ? `:${comment}\n` : '') +
        '\n';
    }

    function fn(res, _cb) {
      res.write(msg, _cb);
    }

    internal(this).applyForTarget(fn, target, cb);
  }

  /**
   * @param {ServerResponse|function} [target]
   * @param {function} [cb]
   */
  resetEventId(target, cb) {
    function fn(res, _cb) {
      res.write(`id\n\n`, _cb);
    }

    internal(this).applyForTarget(fn, target, cb);
  }
}

module.exports = SSEService;

function wrapError(err, msg) {
  err.name = 'SSEServiceError';
  err.message = `${msg}: ${err.message}`;
  return err;
}

/* --- Private Methods --- */

/**
 * _applyForTarget cannot be public, as it exposes Node's ServerResponse to `fn`
 * @param {function} fn
 * @param {SSEID | function | undefined} target
 * @param {function} cb
 */
function _applyForTarget(fn, target, cb) {
  assert.isFunction(fn);
  cb = maybeFn(cb || target);
  if (
    (typeof target !== 'function' || target === cb) &&
    !(target instanceof internal(this).SSEID)
  )
    target = null;

  const { activeSSEConnections, SSEID } = internal(this);

  if (target instanceof SSEID) {
    if (!this.isConnectionActive(target)) return;
    fn(activeSSEConnections.get(target), cb);
    return;
  }

  // Closely watch the performance implications of filling in a whole new Array
  const fns = [];
  for (let res of activeSSEConnections.values()) {
    if (target === null || target(res.locals)) {
      fns.push(_cb => fn(res, _cb));
    }
  }
  async.parallel(fns, cb);
}

function _unregisterFn(res, _cb) {
  const finish = err => {
    const sseId = internal(this).getSSEIdFromResponse(res);
    internal(this).activeSSEConnections.delete(sseId);
    _cb(err);
  };

  if (res.finished || res.socket.destroyed) {
    process.nextTick(finish);
  } else {
    res.end(finish);
  }
}

/**
 * @param {ServerResponse} res
 * @returns {SSEID | null}
 */
function _getSSEIdFromResponse(res) {
  assert.instanceOf(res, ServerResponse);
  const sseId = internal(res).sseId;
  return sseId instanceof internal(this).SSEID ? sseId : null;
}
