/**
 * @param {function[]} fns
 * @return {function}
 */
exports.composeDownstream = function composeDownstream(fns) {
  return fns.reduce((acc, fn) => x => fn(acc(x)), x => x);
};

/**
 * @param {Error} err
 * @param {string} msg
 * @param {string} [name]
 * @returns {Error}
 */
exports.wrapError = function wrapError(err, msg, name = 'SSEServiceError') {
  err.name = name;
  err.message = `${msg}: ${err.message}`;
  return err;
};
