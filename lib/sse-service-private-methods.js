const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const async = require('async');
const assert = require('./utils/assert');
const { SSE_HTTP_RESPONSE_HEADERS } = require('./utils/constants');
const { maybeFn } = require('./utils/maybe');
const wrapError = require('./utils').wrapError;
const composeDownstream = require('./utils').composeDownstream;

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
  internals.setupHTTPResponse = _setupHTTPResponse.bind(sseService);
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
   * @param {targetCb} [cb]
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

    if (target instanceof SSEID) {
      if (!this.isConnectionActive(target)) {
        process.nextTick(() => cb(null, 0));
        return;
      }
      fn(activeSSEConnections.get(target), err => {
        if (err) cb(err);
        else cb(null, 1);
      });
      return;
    }

    if (Array.isArray(target)) {
      const fns = target
        .filter(sseId => this.isConnectionActive(sseId))
        .map(sseId => _cb => fn(activeSSEConnections.get(sseId), _cb));
      async.parallel(fns, err => {
        if (err) cb(err);
        else cb(null, fns.length);
      });
      return;
    }

    // Closely watch the performance implications of filling in a whole new Array
    const fns = [];
    for (let res of activeSSEConnections.values()) {
      if (target === null || target(res.locals)) {
        fns.push(_cb => fn(res, _cb));
      }
    }
    async.parallel(fns, err => {
      if (err) cb(err);
      else cb(null, fns.length);
    });
  }

  const lifecycles = ['transformResponseHeaders', 'transformSend'];

  /**
   * Calls the chain of synchronous lifecycle hooks corresponding to the given <lifecycleStep>.
   * @param {string} lifecycleStep
   * @param {*} arg
   * @private
   */
  function _applyLifecycleHooks(lifecycleStep, arg) {
    if (!lifecycles.includes(lifecycleStep))
      throw new Error(
        `Unsupported synchronous lifecycle step ${lifecycleStep}`
      );

    const fns = internal(this)
      .middlewares.filter(mw => typeof mw[lifecycleStep] === 'function')
      .map(mw => mw[lifecycleStep]);

    return composeDownstream(fns)(arg);
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
    assert.instanceOf(req, IncomingMessage);
    assert.instanceOf(res, ServerResponse);
    if (res.headersSent) {
      throw new Error('Cannot register a connection with headers already sent');
    }

    if (req.headers['accept'] !== 'text/event-stream') {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          error:
            'Cannot register connection : The request HTTP header "Accept" is not set to "text/event-stream"'
        })
      );
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
   * Sends the status code and headers to the response. Sends an initial payload to flush data.
   * @param {ServerResponse} res
   * @param {function} cb
   */
  function _setupHTTPResponse(res, cb) {
    assert.instanceOf(res, ServerResponse);
    try {
      const headers = internal(this).applyLifecycleHooks(
        'transformResponseHeaders',
        SSE_HTTP_RESPONSE_HEADERS
      );
      res.writeHead(200, headers);
    } catch (err) {
      // Events must be emitted asynchronously
      process.nextTick(() => {
        cb(
          wrapError(
            err,
            'Could not send status code and headers',
            'setupHTTPResponseError'
          )
        );
      });
      res.writeHead(500);
      res.end();
      return;
    }

    // Sending empty comment to flush data.
    // Cannot call this.send() because connection is not registered to the service yet.
    res.write(':\n\n', err => {
      if (err) {
        cb(
          wrapError(
            err,
            'Could not send initial heartbeat payload',
            'setupHTTPResponseError'
          )
        );
        return;
      }
      cb(null);
    });
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
 * @callback targetCb
 * @param {Error} [err]
 * @param {number} [numTargetedConnections]
 */

/**
 * @callback asyncServerResponseFn
 * @param {ServerResponse} res
 * @param {errorCb} cb
 */
