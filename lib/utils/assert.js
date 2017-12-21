const { assert } = require('chai');

/*
 * -- Context --
 * Passing wrong arguments types to a function is a programmer error, and such errors must be thrown on the main thread.
 * For more information, see https://www.joyent.com/node-js/production/design/errors
 *
 * -- What this module is about --
 * This module provides utility functions to verify assertions on function inputs.
 * As of now, the function signatures mirror the ones from the 'chai' module. This indirection allows to easily change
 * the implementation without affecting the rest of the codebase, if one needs to drop chai in the future.
 */
module.exports = {
  /**
   * @param {Object} obj
   * @param {Function} ConstructorFn
   * @param {string} [msg]
   */
  instanceOf(obj, ConstructorFn, msg = '') {
    assert.instanceOf(obj, ConstructorFn, msg);
  },

  /**
   * @param {Function} fn
   * @param {String} [msg]
   */
  isFunction(fn, msg = '') {
    assert.isFunction(fn, msg);
  },

  /**
   * @param {Object} obj
   * @param {string} [msg]
   */
  isObject(obj, msg = '') {
    assert.isObject(obj, msg);
  },

  /**
   * @param {boolean} predicate
   * @param {string} [msg]
   */
  isTrue(predicate, msg) {
    assert.isTrue(predicate, msg);
  }
};
