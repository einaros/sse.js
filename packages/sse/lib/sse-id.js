const assert = require('./utils/assert');

function createSSEIDClass(sseService, internal) {
  return class SSEID {
    constructor(secureId) {
      // Using assert.equal would leak the secureId. Use assert.isTrue instead.
      assert.isTrue(
        secureId === internal(sseService).secureId,
        'Cannot create an instance of the SSEID without the secureId from the factory'
      );
    }

    get sseService() {
      return sseService;
    }

    /**
     * @returns {boolean}
     */
    get isConnectionActive() {
      return internal(sseService).activeSSEConnections.has(this);
    }
  };
}

exports.createSSEIDClass = createSSEIDClass;
