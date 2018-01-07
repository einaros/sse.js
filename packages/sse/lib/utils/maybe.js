module.exports = {
  /**
   * @param {*} e
   * @returns {boolean}
   */
  isSet(e) {
    return e !== undefined && e !== null;
  },

  /**
   * @param {*} cb
   * @param {function} [defaultCb]
   * @returns {!function}
   */
  maybeFn(cb, defaultCb = () => null) {
    if (typeof cb !== 'function') return defaultCb;
    return cb;
  }
};
