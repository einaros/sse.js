const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const EventEmitter = require('events');
const uuidv4 = require('uuid/v4');
const setupHTTPResponse = require('./utils/index').setupHTTPResponse;
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
    internals.middlewares = [];
    internals.blockIncomingConnections = false;

    // Keeping connection alive by periodically sending comments (https://www.w3.org/TR/eventsource/#notes)
    internals.heartbeatIntervalId = setInterval(() => {
      this.send({ comment: '' });
    }, HEARTBEAT_INTERVAL * 1000).unref();

    // Allowing method to be used as a standalone function
    this.register = this.register.bind(this);
    this.send = this.send.bind(this);

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
   * @param {...SSEMiddleware} middlewares
   * @return {SSEService}
   */
  use(...middlewares) {
    middlewares.forEach(mw => assert.isObject(mw));
    internal(this).middlewares.push(...middlewares);
    return this;
  }

  /**
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   */
  register(req, res) {
    assert.instanceOf(req, IncomingMessage);
    assert.instanceOf(res, ServerResponse);

    const {
      setupSSE,
      verifyRequest,
      applyAsyncLifecycleHooks,
      emitErr
    } = internal(this);

    const onHTTPResponseReady = err => {
      if (err) return emitErr(e, 'Could not register connection');
      const sseId = setupSSE(req, res);
      applyAsyncLifecycleHooks('afterRegister', [sseId], err => {
        if (err) return emitErr(err, "Error in 'afterRegister' middleware");
        this.emit('connection', sseId, this);
      });
    };

    const mayRegisterConnection = verifyRequest(req, res);
    if (mayRegisterConnection) {
      applyAsyncLifecycleHooks('beforeRegister', [req, res], err => {
        if (err) return emitErr(err, "Error in 'beforeRegister' middleware");
        setupHTTPResponse(res, onHTTPResponseReady);
      });
    }
  }

  unregister(target, cb) {
    internal(this).applyForTarget(internal(this).unregisterFn, target, cb);
  }

  /**
   * @param {errorCb} [cb]
   */
  close(cb) {
    internal(this).blockIncomingConnections = true;
    if (internal(this).heartbeatIntervalId)
      clearInterval(internal(this).heartbeatIntervalId);
    this.unregister(null, cb);
  }

  /**
   * @param {SendPayload} payload
   * @param {SSETarget} [target]
   * @param {errorCb} [cb]
   */
  send(payload, target, cb) {
    try {
      payload = internal(this).applyLifecycleHooks('transformSend', payload);
    } catch (e) {
      process.nextTick(() => cb(e));
    }
    assert.isObjectOrString(payload);
    let msg;
    if (typeof payload === 'string') msg = payload;
    else {
      const { data, event, id, retry, comment } = payload;
      msg =
        (isSet(id) ? `id:${id}\n` : '') +
        (isSet(event) ? `event:${event}\n` : '') +
        (isSet(data) ? `data:${JSON.stringify(data)}\n` : '') +
        (isSet(retry) ? `retry:${retry}\n` : '') +
        (isSet(comment) ? `:${comment}\n` : '') +
        '\n';
    }
    const fn = (res, _cb) => res.write(msg, _cb);
    internal(this).applyForTarget(fn, target, cb);
  }

  /**
   * @param {SSETarget} [target]
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

/**
 * @typedef {SSEID|SSEID[]|targetFunction} SSETarget
 */

/**
 * @callback targetFunction
 * @param {SSEID} sseId
 * @return boolean
 */

/**
 * @typedef {Object} SSEMiddleware
 * @property {beforeRegisterFn} [beforeRegister]
 * @property {afterRegisterFn} [afterRegister]
 * @property {transformSendFn} [transformSend]
 */

/**
 * @callback beforeRegisterFn
 * @param {SSEService} sseService
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {nextFn} next
 */

/**
 * @callback afterRegisterFn
 * @param {SSEService} sseService
 * @param {SSEID} sseId
 * @param {nextFn} next
 */

/**
 * @callback transformSendFn
 * @param {*} payload
 * @return {SendPayload}
 */

/**
 * @callback nextFn
 * @param {Error} err
 */

/**
 * @typedef {Object | string} SendPayload
 * @property {*} [data]
 * @property {string} [event]
 * @property {string} [id]
 * @property {number} [retry]
 * @property {string} [comment]
 */

/**
 * @callback errorCb
 * @param {Error} err
 */
