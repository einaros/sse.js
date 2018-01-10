const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const EventEmitter = require('events');
const uuidv4 = require('uuid/v4');
const wrapError = require('./utils').wrapError;
const setupHTTPResponse = require('./utils').setupHTTPResponse;
const { HEARTBEAT_INTERVAL } = require('./utils/constants');
const assert = require('./utils/assert');
const { isSet } = require('./utils/maybe');
const { createSSEIDClass } = require('./sse-id');
const addPrivateMethods = require('./sse-service-private-methods')
  .addPrivateMethods;

const internal = require('./utils/weak-map').getInternal();

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
    addPrivateMethods(this, internal);
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

    const onHTTPResponseReady = err => {
      if (err) {
        this.emit('error', wrapError(e, 'Could not register connection'));
        return;
      }
      const sseId = internal(this).setupSSE(req, res);
      this.emit('connection', sseId);
    };

    const mayRegisterConnection = internal(this).verifyRequest(req, res);
    if (mayRegisterConnection) {
      setupHTTPResponse(res, onHTTPResponseReady);
    }
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
