const assert = require('chai').assert;
const http = require('http');
const ServerResponse = http.ServerResponse;
const IncomingMessage = http.IncomingMessage;
const SSEService = require('../lib/sse-service');
const {port} = require('./config');
const createSSEServer = require('./utils/server').createSSEServer;
const resetRequestIdCounter = require('./utils/client').resetRequestIdCounter;
const simulateSSEConnection = require('./utils/client').simulateSSEConnection;
const {verifyResponseStatusCodeAndHeaders, assertHeartbeat} = require('./utils/assert');
const {getRandomInt, shortcutSetInterval, restoreSetInterval} = require('./utils');
const {execWithLockOnResource, releaseLock} = require('./utils/lock');

describe('SSEService (integration tests)', () => {
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
    
    it('should refuse to register connections that do not have the required HTTP request headers', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
      sseService.on('connection', sseId => {
        done(new Error('The \'connection\' event should not be fired'))
      });
      simulateSSEConnection(sseServer, {accept: 'application/json'}, (err, requestId) => {
        if(err) return done(err);
        try {
          assert.equal(sseServer.getClientResponse(requestId).statusCode, 400);
          done();
        } catch (e) {
          done(e);
        }
      });
    });
    
    it('should refuse to register connections with headers already sent to the response', _done => {
      // Creating a flawed SSEServer
      sseServer.close(err => {
        if(err) return _done(err);
        createSSEServer(port, true, (err, _sseServer) => {
          if (err) return _done(err);
          sseServer = _sseServer;
          
          const {sseService, done} = setupSSEServiceForServer(sseServer, _done, false);
          sseService.on('connection', sseId => {
            done(new Error('The \'connection\' event should not be fired'))
          });
          
          sseService.on('error', () => {
            done();
          });
  
          simulateSSEConnection(sseServer, (err, requestId) => {
            if(err) return done(err);
            try {
              assert.equal(sseServer.getClientResponse(requestId).statusCode, 500);
              done();
            } catch (e) {
              done(e);
            }
          });
          
        });
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
      const {done} = setupSSEServiceForServer(sseServer, _done, 'Expected empty comment as initial payload');
      simulateSSEConnection(sseServer, (err, requestId) => {
        if (err) return done(err);
        sseServer.getClientResponse(requestId).on('data', chunk => {
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
      simulateSSEConnection(sseServer, err => {
        if(err) done(err);
      });
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
      simulateSSEConnection(sseServer, err => {
        if(err) done(err);
      });
    });
  });
  
  describe('events', () => {
    
    it('should emit a \'connection\' event when connection is registered', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done, `Did not receive 'connection' event`);
      sseService.on('connection', (sseId, _sseService) => {
        try {
          assert.instanceOf(sseId, sseService.SSEID);
          assert.equal(_sseService, sseService);
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer, err => {
        if(err) done(err);
      });
    });
    
    it('should emit a \'clientClose\' event upon client close', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done, `Did not receive 'clientClose' event`);
      
      let sseIdFromConnectionEvent = null;
      execWithLockOnResource('sseId', () => {
        sseService.on('connection', sseId => {
          sseIdFromConnectionEvent = sseId;
          releaseLock('sseId');
        });
      });
      
      sseService.on('clientClose', sseId => {
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
        if(err) return done(err);
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
      const expectedPayload = `id:${id}\nevent:${event}\nretry:${retry}\n:${comment}\ndata:${JSON.stringify(data)}\n\n`;
      
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not receive any data');
      sseService.on('connection', sseId => {
        sseService.send(opts, sseId, (err, numTargetedConnections) => {
          if (err) done(err);
          try {
            assert.equal(numTargetedConnections, 1);
          } catch (e) {
            done(e);
          }
        });
      });
      
      let heartBeatCounter = 0;
      simulateSSEConnection(sseServer, (err, requestId) => {
        if(err) return done(err);
        sseServer.getClientResponse(requestId).on('data', chunk => {
          if (heartBeatCounter === 0) {
            heartBeatCounter++;
          } else {
            assert.equal(chunk.toString(), expectedPayload, `Unexpected payload of data received`);
            done();
          }
        });
      });
      
    });
  
    it('should send data to a single connection (plain text)', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not receive any data');
      sseService.on('connection', sseId => {
        sseService.send('data:Hello World!\n\n', sseId, (err, numTargetedConnections) => {
          if (err) done(err);
          try {
            assert.equal(numTargetedConnections, 1);
          } catch (e) {
            done(e);
          }
        });
      });
    
      let heartBeatCounter = 0;
      simulateSSEConnection(sseServer, (err, requestId) => {
        if(err) return done(err);
        sseServer.getClientResponse(requestId).on('data', chunk => {
          if (heartBeatCounter === 0) {
            heartBeatCounter++;
          } else {
            assert.equal(chunk.toString(), 'data:Hello World!\n\n', `Unexpected payload of data received`);
            done();
          }
        });
      });
    
    });
    
    it('should reset the lastEventID to the client', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not receive any data');
      
      sseService.on('connection', sseId => {
        sseService.resetEventId(sseId, (err, numTargetedConnections) => {
          if (err) done(err);
          try {
            assert.equal(numTargetedConnections, 1);
          } catch (e) {
            done(e);
          }
        });
      });
      
      let heartBeatCounter = 0;
      simulateSSEConnection(sseServer, (err, requestId) => {
        if (err) return done(err);
        sseServer.getClientResponse(requestId).on('data', chunk => {
          if (heartBeatCounter === 0)
            heartBeatCounter++;
          else {
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
      simulateSSEConnection(sseServer, err => {
        if(err) done(err);
      });
    });
    
    it('should contain the last-event-id, if any', _done => {
      const lastEventId = 'some-id-123';
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done, `Did not receive 'connection' event`);
      sseService.on('connection', sseId => {
        try {
          assert.equal(sseId.lastEventId, lastEventId);
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer, {'last-event-id': lastEventId}, err => {
        if(err) done(err);
      });
    });
    
    it('should contain a reference to the res.locals object', _done => {
      const {sseService, done} = setupSSEServiceForServer(sseServer, _done, `Did not receive 'connection' event`);
      sseService.on('connection', sseId => {
        try {
          assert.isObject(sseId.locals);
          done();
        } catch (e) {
          done(e);
        }
      });
      simulateSSEConnection(sseServer, err => {
        if(err) done(err);
      });
    });
    
  });
  
  describe('middleware', () => {
    
    describe('afterRegister (async)', () => {
      
      it('should be called with the correct parameters (sseService, sseId, next)', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not reach lifecycle hook');
        sseService.use({
          afterRegister: function (_sseService, sseId, next) {
            try {
              assert.equal(sseService, _sseService);
              assert.instanceOf(sseId, sseService.SSEID);
              assert.isFunction(next);
              assert(arguments.length === 3);
              done();
            } catch (e) {
              done(e);
            }
          }
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
      it('should be called before the \'connection\' event', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'did not reach lifecycle hook');
        let counter = 0;
        sseService.use({
          afterRegister: function (sseService, sseId, next) {
            if (counter > 0) {
              done(new Error(''));
            } else {
              counter++;
              setTimeout(next, 20);
            }
          }
        });
        sseService.on('connection', () => {
          if (counter === 0)
            done(new Error('The \'connection\' event should not be fired before the afterRegister middleware is called'));
          else
            done();
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
      it('should be called upstream in the lifecycle sequence', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not reach the end of the test');
        sseService.use(
          {
            afterRegister: (sseService, sseId, next) => {
              sseService.send({data: 'And this!'}, sseId, next);
            }
          },
          {
            afterRegister: (sseService, sseId, next) => {
              sseService.send({data: 'Take this!'}, sseId, next);
            }
          }
        );
        let counter = 0;
        simulateSSEConnection(sseServer, (err, requestId) => {
          if(err) return done(err);
          sseServer.getClientResponse(requestId).on('data', chunk => {
            if (counter === 0) {
              counter++;
            } else if (counter === 1) {
              try {
                assert.equal(chunk.toString(), 'data:Take this!\n\n', `Unexpected payload of data received`);
                counter++;
              } catch (e) {
                done(e);
              }
            } else {
              try {
                assert.equal(chunk.toString(), 'data:And this!\n\n', `Unexpected payload of data received`);
                done();
              } catch (e) {
                done(e);
              }
            }
          });
        });
      });
      
      it('should emit errors', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, false, `Did not receive 'error' event`);
        sseService.use({
          afterRegister: (sseService, sseId, next) => {
            next(new Error('Some error'));
          }
        });
        sseService.on('error', err => {
          done();
        });
        sseService.on('connection', sseId => {
          done(new Error('The \'connection\' event should not be fired'))
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
    });
    
    describe('beforeRegister (async)', () => {
      
      it('should be called with the correct parameters (sseService, req, res, next)', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not reach lifecycle hook');
        sseService.use({
          beforeRegister: function (_sseService, req, res, next) {
            try {
              assert.equal(sseService, _sseService);
              assert.instanceOf(req, IncomingMessage);
              assert.instanceOf(res, ServerResponse);
              assert.isFunction(next);
              assert(arguments.length === 4);
              done();
            } catch (e) {
              done(e);
            }
          }
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
      it('should be called after request validation', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not receive response from server');
        sseService.use({
          beforeRegister: (sseService, req, res, next) => {
            done(new Error('The \'beforeRegister\' hook should not have been reached'));
          }
        });
        simulateSSEConnection(sseServer, {accept: 'application/json'}, (err, requestId) => {
          if(err) return done(err);
          const clientResponse = sseServer.getClientResponse(requestId);
          clientResponse.on('data', chunk => {
            try {
              assert.equal(clientResponse.statusCode, 400);
              done();
            } catch (e) {
              done(e);
            }
          })
        });
      });
      
      it('should be called before the HTTP request and sseId are set up', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not reach lifecycle hook');
        sseService.use({
          beforeRegister: (sseService, req, res, next) => {
            try {
              assert.isFalse(res.headersSent);
              done();
            } catch (e) {
              done(e);
            }
          }
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
      it('should be called downstream in the lifecycle sequence', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'Did not receive\'connection\' event');
        sseService.use(
          {
            beforeRegister: (sseService, req, res, next) => {
              req.headers['last-event-id'] = 'I am the Last-Event-ID';
              next();
            }
          },
          {
            beforeRegister: (sseService, req, res, next) => {
              req.headers['last-event-id'] = 'No, I am the Last-Event-ID!';
              next();
            }
          }
        );
        sseService.on('connection', sseId => {
          try {
            assert.equal(sseId.lastEventId, 'No, I am the Last-Event-ID!');
            done();
          } catch (e) {
            done(e);
          }
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
      it('should emit errors', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, false, 'Did not receive \'error\' event');
        sseService.use({
          beforeRegister: (sseService, req, res, next) => {
            next(new Error('Some error'));
          }
        });
        sseService.on('error', err => {
          done();
        });
        sseService.on('connection', sseId => {
          done(new Error('The \'connection\' event should not be fired'))
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
    });
    
    describe('transformSend (sync)', () => {
      
      it('should be called with the correct parameters (payload)', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
        sseService.use({
          // cannot be an arrow function !
          transformSend: function (payload) {
            try {
              assert.equal(arguments.length, 1);
              done();
            } catch (e) {
              done(e);
            }
          }
        });
        sseService.on('connection', sseId => {
          sseService.send({comment: ''}, sseId);
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
      it('should be called downstream in the lifecycle sequence', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
        sseService.use(
          {
            transformSend: payload => (
              typeof payload.data === 'string'
                ? Object.assign({}, payload, {data: payload.data + 'Hey '})
                : payload
            )
          },
          {
            transformSend: payload => (
              typeof payload.data === 'string'
                ? Object.assign({}, payload, {data: payload.data + 'there!'})
                : payload
            )
          }
        );
        sseService.on('connection', sseId => {
          sseService.send({data: ''}, sseId);
        });
        
        let heartBeatCounter = 0;
        simulateSSEConnection(sseServer, (err, requestId) => {
          if(err) return done(err);
          sseServer.getClientResponse(requestId).on('data', chunk => {
            if (heartBeatCounter === 0) {
              heartBeatCounter++;
            } else {
              try {
                assert.equal(chunk.toString(), 'data:Hey there!\n\n', `Unexpected payload of data received`);
                done();
              } catch (e) {
                done(e);
              }
            }
          });
        });
      });
      
      it('should pass errors to sseService.send\'s callback', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, false, 'Did not receive the error');
        sseService.use({
          transformSend: payload => {
            throw new Error('Formatting error');
          }
        });
        sseService.on('connection', sseId => {
          sseService.send({data: 'test'}, sseId, err => {
            if (err) done();
            else done(new Error('Expected error to be passed to send\'s callback'));
          })
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
    });
    
    describe('transformResponseHeaders (sync)', () => {
      
      it('should be called with the correct parameters (headers)', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, 'did not reach middleware');
        sseService.use({
          transformResponseHeaders: function(headers) {
            try {
              assert.equal(arguments.length, 1);
              assert.isObject(headers);
              done();
            } catch (e) {
              done(e);
            }
          }
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
      it('should be called downstream in the lifecycle sequence', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done);
        sseService.use(
          {
            transformResponseHeaders: headers => Object.assign({}, headers, {'Access-Control-Allow-Origin': '*'})
          },
          {
            transformResponseHeaders: headers => Object.assign({}, headers, {'Access-Control-Allow-Origin': 'https://www.npmjs.com'})
          }
        );
        
        simulateSSEConnection(sseServer, (err, requestId) => {
          if(err) return done(err);
          assert.equal(sseServer.getClientResponse(requestId).headers['access-control-allow-origin'], 'https://www.npmjs.com');
          done();
        });
      });
      
      it('should emit an error event in case of error', _done => {
        const {sseService, done} = setupSSEServiceForServer(sseServer, _done, false, `Did not receive 'error' event`);
        sseService.use({
          transformResponseHeaders: headers => {
            throw new Error('Some error');
          }
        });
        sseService.on('error', err => {
          done();
        });
        sseService.on('connection', sseId => {
          done(new Error('The \'connection\' event should not be fired'))
        });
        simulateSSEConnection(sseServer, err => {
          if(err) done(err);
        });
      });
      
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
      const {done} = setupSSEServiceForServer(sseServer, _done, 'heartbeats not sent every 15 seconds', 150);
      restoreSetInterval();
      
      let heartBeatCounter = 0;
      
      simulateSSEConnection(sseServer, (err, requestId) => {
        if(err) return done(err);
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
          try {
            assert.closeTo(timeInNanoSeconds, replacedTime * 1e6, 35 * 1e5, 'Heartbeat not sent every 15 seconds');
            assertHeartbeat(chunk);
          } catch (e) {
            return done(e);
          }
          done();
        });
      });
    });
    
  });
});

/* -- Helpers -- */

/**
 * @param {SSEServer} sseServer
 * @param {doneFn} _done
 * @param {boolean|string | number} [addErrorHandler]
 * @param {string | number} [timeoutMsg]
 * @param {number} [timeout]
 * @returns {{sseService: SSEService, done: function}}
 */
function setupSSEServiceForServer(sseServer, _done, addErrorHandler = true, timeoutMsg = 'did not reach end of the test', timeout = 75) {
  // Normalizing args
  if (typeof addErrorHandler === 'string') {
    timeout = typeof timeoutMsg === 'number' ? timeoutMsg : 75;
    timeoutMsg = addErrorHandler;
    addErrorHandler = true;
  } else if (typeof addErrorHandler === 'number') {
    timeout = addErrorHandler;
    addErrorHandler = true;
  } else if (typeof timeoutMsg === 'number') {
    timeout = timeoutMsg;
    timeoutMsg = 'did not reach end of the test';
  }
  assert.isBoolean(addErrorHandler);
  assert.isString(timeoutMsg);
  assert.isNumber(timeout);
  
  // Custom flavor of mocha's done function
  let called = false;
  let timeoutId = null;
  const done = new Proxy(_done, {
    apply: function (target, that, args) {
      if (!called) {
        called = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        target.apply(that, args);
      }
    }
  });
  
  // Setting up timeout to ensure tests end in a reasonable delay in case of bugs
  timeoutId = setTimeout(() => done(new Error(`Timeout : ${timeoutMsg}`)), timeout).unref();
  
  // Setting up SSE Service
  const sseService = new SSEService();
  if (addErrorHandler)
    sseService.on('error', done);
  sseServer.setSSEService(sseService);
  
  return {sseService, done};
}

/**
 * @callback doneFn
 * @param {Error} [err]
 */
