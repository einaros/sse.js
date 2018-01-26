const assert = require('chai').assert;
const SSEService = require('../lib/sse-service');
const {port} = require('./config');
const createSSEServer = require('./utils/server').createSSEServer;
const resetRequestIdCounter = require('./utils/client').resetRequestIdCounter;
const simulateSSEConnection = require('./utils/client').simulateSSEConnection;
const {verifyResponseStatusCodeAndHeaders, assertHeartbeat} = require('./utils/assert');
const {getRandomInt, shortcutSetInterval, restoreSetInterval} = require('./utils');
const {execWithLockOnResource, releaseLock} = require('./utils/lock');

describe('SSEService', () => {
  /** @type {SSEServer} */
  let sseServer = null;
  
  /* -- Lifecycle -- */
  
  beforeEach('Setting up SSE server', done => {
    resetRequestIdCounter();
    createSSEServer(port, (err, _sseServer) => {
      if (err) return done(err);
      sseServer = _sseServer;
      done();
    });
  });
  
  afterEach('Cleaning HTTP server', done => {
    sseServer.close(done);
    sseServer = null;
  });
  
  /* -- Tests -- */
  
  describe('register/unregister', () => {
    
    it('should refuse connections that do not have the required HTTP request headers', _done => {
      const {done} = setupSSEServiceForServer(sseServer, _done);
      simulateSSEConnection(sseServer, {accept: 'application/json'}, (err, requestId) => {
        try {
          assert.equal(sseServer.getClientResponse(requestId).statusCode, 400);
          done();
        } catch (e) {
          done(e);
        }
      });
    });
    
    it('should respond to the client with the correct HTTP response headers', _done => {
      const {done} = setupSSEServiceForServer(sseServer, _done);
      simulateSSEConnection(sseServer, (err, requestId) => {
        if (err) return done(err);
        const clientResponse = sseServer.getClientResponse(requestId);
        try {
          verifyResponseStatusCodeAndHeaders(clientResponse);
          done();
        } catch (e) {
          done(e);
        }
      });
    });
    
    it('should initiate the connection with an empty comment to prevent socket from hanging', _done => {
      const {done} = setupSSEServiceForServer(sseServer, _done);
      const timeoutId = setTimeout(() => done(new Error(`Expected empty comment as initial payload`)), 75).unref();
      simulateSSEConnection(sseServer, (err, requestId) => {
        if (err) return done(err);
        sseServer.getClientResponse(requestId).on('data', chunk => {
          clearTimeout(timeoutId);
          try {
            assertHeartbeat(chunk);
            done()
          } catch (e) {
            done(e);
          }
        });
      });
    });
    
    it('should expose the number of active connections', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      try {
        assert.equal(sseService.numActiveConnections, 0);
      } catch (e) {
        done(e);
      }
      sseService.on('connection', () => {
        try {
          assert.equal(sseService.numActiveConnections, 1);
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer);
    });
    
    it('should indicate if a connection is active', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      sseService.on('connection', sseId => {
        try {
          assert.isTrue(sseService.isConnectionActive(sseId));
          sseService.unregister(sseId, err => {
            if (err) return done(err);
            try {
              assert.isFalse(sseService.isConnectionActive(sseId));
              done();
            } catch (e) {
              done(e);
            }
          });
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer);
    });
  });
  
  describe('events', () => {
    
    it('should emit a \'connection\' event when connection is registered', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      const timeoutId = setTimeout(() => done(new Error(`Did not receive 'connection' event`)), 50).unref();
      sseService.on('connection', sseId => {
        clearTimeout(timeoutId);
        try {
          assert.instanceOf(sseId, sseService.SSEID);
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer);
    });
    
    it('should emit a \'clientClose\' event upon client close', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      
      let sseIdFromConnectionEvent = null;
      execWithLockOnResource('sseId', () => {
        sseService.on('connection', sseId => {
          sseIdFromConnectionEvent = sseId;
          releaseLock('sseId');
        });
      });
      
      const timeoutId = setTimeout(() => done(new Error(`Did not receive 'clientClose' event`)), 150).unref();
      sseService.on('clientClose', sseId => {
        clearTimeout(timeoutId);
        execWithLockOnResource('sseId', () => {
          try {
            assert.equal(sseId, sseIdFromConnectionEvent);
            assert.isFalse(sseService.isConnectionActive(sseId));
            assert.equal(sseService.numActiveConnections, 0);
            done();
          } catch (e) {
            done(e);
          }
        });
      });
      
      simulateSSEConnection(sseServer, (err, requestId) => {
        try {
          assert.equal(sseService.numActiveConnections, 1);
        } catch (e) {
          done(e);
        }
        sseServer.endClientResponseIfAny(requestId);
      });
    });
    
  });
  
  describe('sending data', () => {
    
    it('should send data to a single connection (id, event, data, retry, comment)', _done => {
      const id = '2347', event = 'connection', data = {hello: 'world'}, retry = 100, comment = 'hey, there !';
      const opts = {id, event, data, retry, comment};
      const expectedPayload = `id:${id}\nevent:${event}\ndata:${JSON.stringify(data)}\nretry:${retry}\n:${comment}\n\n`;
      
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      sseService.on('connection', sseId => {
        sseService.send(opts, sseId, err => {
          if (err) done(err);
        });
      });
      
      let heartBeatCounter = 0;
      const timeoutId = setTimeout(() => done(new Error(`Did not receive any data`)), 150).unref();
      simulateSSEConnection(sseServer, (err, requestId) => {
        sseServer.getClientResponse(requestId).on('data', chunk => {
          if (heartBeatCounter === 0) {
            heartBeatCounter++;
          } else {
            clearTimeout(timeoutId);
            assert.equal(chunk.toString(), expectedPayload, `Unexpected payload of data received`);
            done();
          }
        });
      });
      
    });
    
    it('should reset the lastEventID to the client', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      
      sseService.on('connection', sseId => {
        sseService.resetEventId(sseId, err => {
          if (err) done(err);
        });
      });
      
      let heartBeatCounter = 0;
      const timeoutId = setTimeout(() => done(new Error(`Did not receive any data`)), 50).unref();
      simulateSSEConnection(sseServer, (err, requestId) => {
        if (err) return done(err);
        sseServer.getClientResponse(requestId).on('data', chunk => {
          if (heartBeatCounter === 0)
            heartBeatCounter++;
          else {
            clearTimeout(timeoutId);
            try {
              assert.equal(chunk.toString(), 'id\n\n');
              done();
            } catch (e) {
              done(e);
            }
          }
        });
      });
    });
    
  });
  
  describe('sseid', () => {
    
    it('should only be creatable by the sseService', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      sseService.on('connection', sseId => {
        try {
          const SSEID = sseId.constructor;
          new SSEID('wrongSecureId');
          done(new Error('The SSEID constructor should only be usable by the sseService'));
        } catch (e) {
          done();
        }
      });
      simulateSSEConnection(sseServer);
    });
  
    it('should contain the last-event-id, if any', _done => {
      const lastEventId = 'some-id-123';
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      const timeoutId = setTimeout(() => done(new Error(`Did not receive 'connection' event`)), 50).unref();
      sseService.on('connection', sseId => {
        clearTimeout(timeoutId);
        try {
          assert.equal(sseId.lastEventId, lastEventId);
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer, {'last-event-id': lastEventId});
    });
  
    it('should contain a reference to the res.locals object', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      const timeoutId = setTimeout(() => done(new Error(`Did not receive 'connection' event`)), 50).unref();
      sseService.on('connection', sseId => {
        clearTimeout(timeoutId);
        try {
          assert.isObject(sseId.locals);
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer);
    });
    
  });
  
  describe('other', () => {
    
    it('should provide a reference to the SSEID constructor', () => {
      const sseService = new SSEService();
      assert.isFunction(sseService.SSEID);
    });
    
    it('should send heartbeats every 15 seconds', _done => {
      
      // Proxying setInterval so it gets executed quicker than 15 seconds
      const replacedTime = getRandomInt(25, 80); // Adding randomness to maximize failure detection
      shortcutSetInterval(15000, replacedTime);
      const time = process.hrtime();
      const {done} = setupSSEServiceForServer(sseServer, _done);
      restoreSetInterval();
      
      let heartBeatCounter = 0;
      
      simulateSSEConnection(sseServer, (err, requestId) => {
        sseServer.getClientResponse(requestId).on('data', chunk => {
          const diff = process.hrtime(time);
          const timeInNanoSeconds = diff[0] * 1e9 + diff[1];
          
          // First heartbeat (sent when establishing connection)
          if (heartBeatCounter === 0) {
            try {
              assert.closeTo(timeInNanoSeconds, 10e6, 10e6, 'First heartbeat is not sent right after connection establishment');
              assertHeartbeat(chunk);
            } catch (e) {
              return done(e);
            }
            heartBeatCounter++;
            return;
          }
          
          // Second heartbeat, expected to be received after approximately 15 seconds
          clearTimeout(timeoutId);
          try {
            assert.closeTo(timeInNanoSeconds, replacedTime * 1e6, 35 * 1e5, 'Heartbeat not sent every 15 seconds');
            assertHeartbeat(chunk);
          } catch (e) {
            return done(e);
          }
          done();
        });
        
        const timeoutId = setTimeout(() => done(new Error(`Timeout : heartbeats not sent every 15 seconds`)), 150).unref();
      });
    });
    
  });
});

/* -- Helpers -- */

/**
 * @param {SSEServer} sseServer
 * @param {function} _done
 * @returns {{sseService: SSEService, done: function}}
 */
function setupSSEServiceForServer(sseServer, _done) {
  let called = false;
  const done = new Proxy(_done, {
    apply: function (target, that, args) {
      if (!called) {
        called = true;
        target.apply(that, args);
      }
    }
  });
  const sseService = new SSEService();
  sseService.on('error', done);
  sseServer.setSSEService(sseService);
  return {sseService, done};
}