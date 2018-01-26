const IncomingMessage = require('http').IncomingMessage;
const ServerResponse = require('http').ServerResponse;
const assert = require('./utils/assert');

const internal = require('./utils/weak-map').getInternal();

/**
 * @param {string} _secureId
 * @returns {function}
 */
function createSSEIDClass(_secureId) {
  return class SSEID {
    /**
     * @param {!string} secureId
     * @param {IncomingMessage} req
     * @param {ServerResponse} res
     */
    constructor(secureId, req, res) {
      // Using assert.equal would leak the secureId. Use assert.isTrue instead.
      assert.isTrue(
        secureId === _secureId,
        'Cannot create an instance of the SSEID without the secureId from the sseService'
      );
      assert.instanceOf(req, IncomingMessage);
      assert.instanceOf(res, ServerResponse);

      internal(this).res = res;
      internal(this).lastEventId =
        typeof req.headers['last-event-id'] === 'string'
          ? req.headers['last-event-id']
          : null;
    }

    /**
     * @returns {string|null}
     */
    get lastEventId() {
      return internal(this).lastEventId;
    }

    /**
     * @returns {Object}
     */
    get locals() {
      return internal(this).res.locals;
    }
  };
}

exports.createSSEIDClass = createSSEIDClass;
