const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const EventEmitter = require('events');
const uuidv4 = require('uuid/v4');
const async = require('async');
const assert = require('./utils/assert');
const { maybeFn } = require('./utils/maybe');
const { createSSEIDClass } = require('./sse-id');

const internal = require('./utils/weak-map').getInternal();

const HEARTBEAT_INTERVAL = 15;
const HEARTBEAT_MESSAGE = 'heartbeat';
const SSE_HTTP_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no'
};

class SSEService extends EventEmitter {
  constructor() {
    super();
    internal(this).secureId = uuidv4();
    internal(this).SSEID = createSSEIDClass(this, internal);
    internal(this).activeSSEConnections = new Map();
    internal(this).blockIncomingConnections = false;
    internal(this).applyForTarget = applyForTarget.bind(this);

    // Keeping connection alive by periodically sending comments (https://www.w3.org/TR/eventsource/#notes)
    internal(this).heartbeatIntervalId = setInterval(() => {
      this.send({ comment: HEARTBEAT_MESSAGE });
    }, HEARTBEAT_INTERVAL * 1000).unref();

    // So `sseService.register` can be used as a standalone function (as an express middleware, for instance)
    this.register = this.register.bind(this);
  }

  get SSEID() {
    return internal(this).SSEID;
  }

  get numActiveConnections() {
    return internal(this).activeSSEConnections.size;
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
    if (getSSEIdFromResponse(res, SSEID) !== null) {
      return;
    }
    
    let sseId = null;
    try {
      sseId = new SSEID(secureId);
      writeSSELocalsInResponse(req, res, sseId);
      res.writeHead(200, SSE_HTTP_RESPONSE_HEADERS);

      res.on('close', () =>
        this.unregister(sseId, () =>
          this.emit('clientClose', sseId, res.locals)
        )
      );
      res.on('finish', () => this.unregister(sseId));
    } catch (e) {
      // Events must be emitted asynchronously
      process.nextTick(() => {
        this.emit('error', wrapError(e, 'Could not register connection'));
      });
      res.writeHead(500);
      res.end();
      return;
    }

    // Sending a heartbeat to flush data.
    // Cannot call this.send() because connection is not registered to the service yet.
    res.write(`:${HEARTBEAT_MESSAGE}\n\n`, err => {
      if (err) {
        this.emit(
          'error',
          wrapError(err, 'Could not send initial heartbeat payload')
        );
        return;
      }
      activeSSEConnections.set(sseId, res);
      this.emit('connection', sseId, res.locals);
    });
  }

  unregister(target, cb) {
    const { activeSSEConnections } = internal(this);

    const fn = (res, _cb) => {
      const finish = err => {
        const sseId = getSSEIdFromResponse(res, internal(this).SSEID);
        activeSSEConnections.delete(sseId);
        _cb(err);
      };

      if (res.finished || res.socket.destroyed) {
        process.nextTick(finish);
      } else {
        res.end(finish);
      }
    };

    internal(this).applyForTarget(fn, target, cb);
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
        (id ? `id:${id}\n` : '') +
        (event ? `event:${event}\n` : '') +
        (data ? `data:${JSON.stringify(data)}\n` : '') +
        (retry ? `retry:${retry}\n` : '') +
        (comment ? `:${comment}\n` : '') +
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

function applyForTarget(fn, target, cb) {
  assert.isFunction(fn);
  cb = maybeFn(cb || target);
  target =
    (typeof target === 'function' && target !== cb) ||
    target instanceof internal(this).SSEID
      ? target
      : null;

  const { activeSSEConnections, SSEID } = internal(this);

  if (target instanceof SSEID) {
    if (!target.isConnectionActive) return;
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

function wrapError(err, msg) {
  err.name = 'SSEServiceError';
  err.message = `${msg}: ${err.message}`;
  return err;
}

/**
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @return {{status: number, message: string} | null}
 */
function validateRequestForSSE(req, res) {
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
}

function writeSSELocalsInResponse(req, res, sseId) {
  if (!(res.locals instanceof Object)) res.locals = {};

  const sse = {};
  if (req.headers['last-event-id'])
    sse.lastEventId = req.headers['last-event-id'];
  Object.defineProperty(sse, 'sseId', {
    value: sseId,
    writable: false,
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(res.locals, 'sse', {
    value: sse,
    writable: false,
    enumerable: true,
    configurable: false
  });
}

/**
 * @param {ServerResponse} res
 * @param {function} SSEID
 * @param {Object} [res.locals]
 * @returns {SSEID | null}
 */
function getSSEIdFromResponse(res, SSEID) {
  assert.instanceOf(res, ServerResponse);
  const sseId = res.locals && res.locals.sse && res.locals.sse.sseId;
  if (sseId instanceof SSEID) return sseId;
  return null;
}

/**
 * @callback transformFn
 * @param {*} data
 * @return *
 */
