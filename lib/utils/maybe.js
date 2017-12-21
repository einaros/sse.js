module.exports = {
  /**
   * @param {*} cb
   * @param {function} [defaultCb]
   * @returns {function}
   */
  maybeFn(cb, defaultCb = () => null) {
    if (typeof cb !== 'function') return defaultCb;
    return cb;
  }
};
