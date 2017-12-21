/*
 * Weak-Maps are a sound way to manage true encapsulation. This module exposes utility functions for that purpose.
 *
 * -- Usage --
 *
 * const internal = getInternal();
 * class MyClass {
 *  constructor(){
 *    internal(this).privateProperty = 3;
 *  }
 *
 *  // read-only getter
 *  get privateProperty(){
 *    return internal(this).privateProperty;
 *  }
 * }
 */

module.exports = {
  
  /**
   * @returns {internalFn}
   */
  getInternal() {
    const map = new WeakMap();
    return function internal(object) {
      if (!map.has(object)) map.set(object, {});
      return map.get(object);
    }
  }
};

/**
 * @callback internalFn
 * @param {Object} obj
 * @return {Object}
 */
