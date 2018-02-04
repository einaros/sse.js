const SSEService = require('../../').SSEService;
const {sseEventSourcePolyfillMiddleware} = require('../../').middlewares;
const sseService = new SSEService();

let nrConnections = 0;

sseService.on('connection', () => {
  console.log('connection');
  sseService.send({event: 'nrUsers', data: ++nrConnections});
});

sseService.on('clientClose', () => {
  console.log('clientClose');
  sseService.send({event: 'nrUsers', data: --nrConnections});
});

sseService.use(sseEventSourcePolyfillMiddleware);

module.exports = sseService;