/*
 * -- Context --
 * Passing wrong arguments types to a function is a programmer error, and such errors must be thrown on the main thread.
 * For more information, see https://www.joyent.com/node-js/production/design/errors
 *
 * -- What this module is about --
 * This module provides utility functions to verify assertions on function inputs.
 * It is not using any assertion library in order to keep the module's dependency tree small. Yet, if this module becomes
 * too large to maintain, one can consider the use of an assertion library BUT its usage must be contained inside this
 * module, so it can easily be changed in the future if need be.
 */
module.exports = {
  /**
   * @param {Object} obj
   * @param {Function} ConstructorFn
   * @param {string} [msg]
   */
  instanceOf(obj, ConstructorFn, msg = '') {
    if (obj instanceof ConstructorFn)
      return;
    throwErr(msg, `Expected object to be instance of ${typeof ConstructorFn === 'function' ? ConstructorFn.name : null}`);
  },
  
  /**
   * @param {Function} fn
   * @param {String} [msg]
   */
  isFunction(fn, msg = '') {
    if (typeof fn === 'function')
      return;
    throwErr(msg, `Expected fn to be a function`);
  },
  
  /**
   * @param {Object} obj
   * @param {string} [msg]
   */
  isObject(obj, msg = '') {
    if (obj !== null && typeof obj === 'object')
      return;
    throwErr(msg, `Expected obj to be an object`);
  },
  
  /**
   * @param {boolean} predicate
   * @param {string} [msg]
   */
  isTrue(predicate, msg) {
    if (predicate === true)
      return;
    throwErr(msg, `Expected predicate to be true`);
  }
};

function throwErr(...msgs) {
  throw new Error(msgs.filter(msg => msg.trim() !== '').join(': '));
}