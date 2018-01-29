const URL = require('url');
const padding = new Array(2049).join(' ');

/* Note : The periodic sending of comments is already handled by the sseService */
module.exports = {
  beforeRegister: (sseService, req, res, next) => {
    const lastEventId = URL.parse(req.url, true).query.lastEventId;
    const shouldOverrite =
      req.headers['last-event-id'] === undefined &&
      typeof lastEventId === 'string';
    if (shouldOverrite) req.headers['last-event-id'] = lastEventId;
    process.nextTick(next);
  },
  afterRegister: (sseService, sseId, next) => {
    sseService.send({ comment: padding }, sseId, next);
  }
};
