const originalSetInterval = global.setInterval;

/**
 * Replaces setInterval(fn, <timeToReplace>) calls by setInterval(fn, <replacedTime>)
 * @param {number | null} timeToReplace
 * @param {number} [replacedTime]
 */
exports.shortcutSetInterval = function shortcutSetInterval(timeToReplace = null, replacedTime = 10) {
  global.setInterval = new Proxy(originalSetInterval, {
    /**
     * @param {Function} target
     * @param {Object} that
     * @param {Array} args
     */
    apply: function (target, that, args) {
      if (timeToReplace === null || args[1] === timeToReplace)
        return target.apply(that, [args[0], replacedTime]);
      else
        return target.apply(that, args);
    }
  });
};

exports.restoreSetInterval = function restoreSetInterval(){
  global.setInterval = originalSetInterval;
};

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
exports.getRandomInt = function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
};
