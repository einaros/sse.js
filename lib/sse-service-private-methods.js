const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const async = require('async');
const validateRequestForSSE = require('./utils/index').validateRequestForSSE;
const assert = require('./utils/assert');
const { maybeFn } = require('./utils/maybe');
const wrapError = require('./utils/index').wrapError;

exports.addPrivateMethods = function addPrivateMethods(sseService, internal) {
  const internals = internal(sseService);
  internals.applyForTarget = _applyForTarget.bind(sseService);
  internals.applyLifecycleHooks = _applyLifecycleHooks.bind(sseService);
  internals.applyAsyncLifecycleHooks = _applyAsyncLifecycleHooks.bind(
    sseService
  );
  internals.emitErr = _emitErr.bind(sseService);
  internals.unregisterFn = _unregisterFn.bind(sseService);
  internals.getSSEIdFromResponse = _getSSEIdFromResponse.bind(sseService);
  internals.verifyRequest = _verifyRequest.bind(sseService);
  internals.setupSSE = _setupSSE.bind(sseService);

  /**
   * Shorthand method to emit errors
   * @param {Error} e
   * @param {string} msg
   * @private
   */
  function _emitErr(e, msg) {
    this.emit('error', wrapError(e, msg));
  }

  /**
   * Applies the asynchronous function <fn> on ServerResponse objects targeted by <target>.
   * This method cannot be public, as it exposes Node's ServerResponse to <fn>
   * @param {asyncServerResponseFn} fn
   * @param {SSETarget} [target]
   * @param {errorCb} [cb]
   * @private
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

    if (Array.isArray(target)) {
      const fns = target
        .filter(sseId => this.isConnectionActive(sseId))
        .map(sseId => _cb => fn(activeSSEConnections.get(sseId), _cb));
      async.parallel(fns, cb);
      return;
    }

    if (target instanceof SSEID) {
      if (!this.isConnectionActive(target)) {
        cb();
        return;
      }
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

  const lifecycleInformation = {
    transformSend: {
      isUpstream: false,
      compositionFn: fns => fns.reduce((acc, fn) => x => acc(fn(x)), x => x)
    }
  };

  /**
   * Calls the chain of synchronous lifecycle hooks corresponding to the given <lifecycleStep>.
   * @param {string} lifecycleStep
   * @param {*} arg
   * @private
   */
  function _applyLifecycleHooks(lifecycleStep, arg) {
    if (!lifecycleInformation.hasOwnProperty(lifecycleStep))
      throw new Error(
        `Unsupported synchronous lifecycle step ${lifecycleStep}`
      );

    const { isUpstream, compositionFn } = lifecycleInformation[lifecycleStep];
    const fns = internal(this)
      .middlewares.filter(mw => typeof mw[lifecycleStep] === 'function')
      .map(mw => mw[lifecycleStep]);
    if (isUpstream) fns.reverse();

    if (lifecycleStep === 'transformSend') return compositionFn(fns)(arg);
  }

  const isAsyncLifecycleUpstream = {
    afterRegister: true,
    beforeRegister: false
  };

  /**
   * Calls the chain of asynchronous lifecycle hooks corresponding to the given <lifecycleStep>.
   * @param {string} lifecycleStep
   * @param {Array} args
   * @param {function} cb
   */
  function _applyAsyncLifecycleHooks(lifecycleStep, args, cb) {
    if (!isAsyncLifecycleUpstream.hasOwnProperty(lifecycleStep))
      throw new Error(
        `Unsupported asynchronous lifecycle step ${lifecycleStep}`
      );
    const fns = internal(this)
      .middlewares.filter(mw => typeof mw[lifecycleStep] === 'function')
      .map(mw => _cb =>
        mw[lifecycleStep].apply(null, [sseService, ...args, _cb])
      );
    async.waterfall(
      isAsyncLifecycleUpstream[lifecycleStep] ? fns.reverse() : fns,
      cb
    );
  }

  /**
   * An asyncServerResponseFn to be used in _applyForTarget for unregistering a connection
   * This method is refactored here once and for all instead of creating a new function every time the public sseService.unregister method is called
   * @param {ServerResponse} res
   * @param {errorCb} cb
   * @private
   */
  function _unregisterFn(res, cb) {
    const finish = err => {
      const sseId = internal(this).getSSEIdFromResponse(res);
      internal(this).activeSSEConnections.delete(sseId);
      cb(err);
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
   * @private
   */
  function _getSSEIdFromResponse(res) {
    assert.instanceOf(res, ServerResponse);
    const sseId = internal(res).sseId;
    return sseId instanceof internal(this).SSEID ? sseId : null;
  }

  /**
   * Returns true iff the service should register the connection.
   * This method may modify the request in case of returning false and is therefore NOT idempotent.
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @returns {boolean}
   * @private
   */
  function _verifyRequest(req, res) {
    const validationError = validateRequestForSSE(req, res);
    if (validationError !== null) {
      res.writeHead(validationError.status);
      res.end(JSON.stringify({ error: validationError.message }));
      return false;
    }

    if (internal(this).blockIncomingConnections) {
      // We're not doing anything fancy here. A more elaborate strategy (sending a "retry", status code 204, ...)
      // can be defined later if there is a need from the community.
      res.end();
      return false;
    }

    // Not registering a connection that has already been registered
    return internal(this).getSSEIdFromResponse(res) === null;
  }

  /**
   * Sets up internal state of the sseService to fully register the request.
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @returns {SSEID}
   * @private
   */
  function _setupSSE(req, res) {
    const { activeSSEConnections, SSEID, secureId } = internal(this);

    // Setting up locals object if it doesn't exist
    if (!res.hasOwnProperty('locals'))
      Object.defineProperty(res, 'locals', { value: {} });

    // Identifier of the SSE connection
    const sseId = new SSEID(secureId, req, res);

    // Event handlers to guarantee state integrity
    res.on('close', () =>
      this.unregister(sseId, () => this.emit('clientClose', sseId))
    );
    res.on('finish', () => this.unregister(sseId));

    // Updating internal state
    activeSSEConnections.set(sseId, res);
    internal(res).sseId = sseId;

    return sseId;
  }
};

/**
 * @callback errorCb
 * @param {Error} [err]
 */

/**
 * @callback asyncServerResponseFn
 * @param {ServerResponse} res
 * @param {errorCb} cb
 */
