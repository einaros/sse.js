# SSE

An unopinionated, minimalist, [standard](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events)-focused API for managing Server-Sent Events (SSE) in Node.js.

## Usage

```javascript
const http = require('http');
const { SSEService } = require('sse');

const sseService = new SSEService();
http.createServer((request, response) => {
  if(request.method === 'GET' && request.url === '/sse') {
    sseService.register(request, response);
  }
}).listen(8080);

sseService.on('connection', sseId => {
  sseService.send('hello', sseId);
});
```
More advanced examples are available in the [examples/](examples) directory.

# API

Server-Sent Events are entirely managed by an `sseService`.

This service guarantees consistency with respect to the [EventSource specification](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events), provided that the server delegates the request to the `sseService` without sending any headers/data to the response.

 * [Class sse.SSEService](#class-ssesseservice)
     * [new sse.SSEService()](#new-ssesseservice)
     * [Class: sseService.SSEID](#class-sseservicesseid)
        * [sseId.lastEventId](#sseidlasteventid)
        * [sseId.locals](#sseidlocals)
     * [Event: 'clientClose'](#event-clientclose)
     * [Event: 'connection'](#event-connection)
     * [Event: 'error'](#event-error)
     * [sseService.close([cb])](#sseserviceclosecb)
     * [sseService.isConnectionActive(sseId)](#sseserviceisconnectionactivesseid)
     * [sseService.numActiveConnections](#sseservicenumactiveconnections)
     * [sseService.register(req, res)](#sseserviceregisterreq-res)
     * [sseService.resetLastEventId([cb])](#sseserviceresetlasteventidcb)
     * [sseService.send(opts[, target[, cb]])](#sseservicesendopts-target-cb)
     * [sseService.unregister([target[, cb]])](#sseserviceunregistertarget-cb)
     * [sseService.use(...middlewares)](#sseserviceusemiddlewares)

## Class `sse.SSEService`

### `new sse.SSEService()`

Sets up a new `SSEService`.

While it is allowed to have multiple instances of an `SSEService` on the same server, it is *not* recommended as doing so would multiply the number of open connections to that server, consuming resources unnecessarily.

### Class: `sseService.SSEID`

Identifier object that represents an SSE connection managed by the `sseService`. An `sseId` can only be created by the service.

A closed connection can no longer accept Server-Sent Events.

#### `sseId.lastEventId`

Returns the `Last-Event-ID` HTTP request header that was issued with the represented SSE connection, if any.

#### `sseId.locals`

Returns the reference to the `response.locals` object, where `response` is the Node.js `ServerResponse` object associated with the represented SSE connection.

This `locals` object is a convention coming [from Express.js](http://expressjs.com/en/api.html#res.locals) to store metadata along with response object.
This convention is reproduced here to allow fine-grained targeting when sending events to a set of open SSE connections.

If the `locals` object has not been set prior the registering (for instance, in vanilla Node.js usage), it is set to the empty object `{}` by the sseService.

### Event: 'clientClose'

  - `sseId {sse.SSEID}` - Connection's SSE identifier

Event emitted when the client closed the connection

### Event: 'connection'

  - `sseId {SSEID}` - Connection's SSE identifier

Event emitted when an SSE connection has been successfully established

### Event: 'error'

  - `err {Error}` - The error

Event emitted when an error occurred during SSE connection's establishment.

### `sseService.close([cb])`

  - `cb {function}` (optional) - Callback function

Closes the service by terminating all open connections, and frees up resources. The service won't accept any more connection.
Further incoming connections will be terminated immediately with a `204` HTTP status code, preventing clients from attempting to reconnect.

### `sseService.isConnectionActive(sseId)`

Returns a boolean indicating if the connection is active.

 - `true` if the `sseId` represents an active SSE connection managed by this sseService.
 - `false` otherwise. If the sseId was issued from this sseService, the connection is now closed and no longer managed by the service.

### `sseService.numActiveConnections`

Number of active SSE connections managed by this service (read-only).

### `sseService.register(req, res)`

  - `req {http.IncomingMessage}` - The incoming HTTP request
  - `res {http.ServerResponse}` - The server response

Sets up an SSE connection by doing the following :

  - sends appropriate HTTP headers to the response
  - maintains connection alive with the regular sending of empty comments (called "heartbeats")
  - identifies the response with an `sseId`

The connection will be rejected if the `Accept` header in the `req` object is not set to `'text/event-stream'`.

This function accepts no callback, to avoid subsequent code to possibly sending data to the `res` object.
Instead, the service will emit a 'connection' event with the `sseId` if the connection was successful. If not, it will emit an 'error' event.

### `sseService.resetLastEventId([cb])`

  - `cb {function}` (optional) - Callback function

Resets the Last-Event-ID to the client

### `sseService.send(opts[, target[, cb]])`

  - `opts {Object}`
  - `opts.data {*}` (optional) - Defaults to the empty string
  - `opts.event {string}` (optional) - If falsy, no `event` field will be sent
  - `opts.id {string}` (optional) - If falsy, no `id` field will be sent
  - `opts.retry {number}` (optional) - If falsy, no `retry` field will be sent
  - `opts.comment {string}` (optional) - If falsy, no comment will be sent
  - `target {SSEID | function}` (optional) - The target connection(s). Defaults to `null` (targets all connections)
  - `cb {function}` (optional) - Callback function

General-purpose method for sending information to the client. Convenience methods may be added in the future to cover most common use cases.

### `sseService.unregister([target[, cb]])`

  - `target {SSEID | function}` - The target connection(s). Defaults to `null` (targets all connections)
  - `cb {function}` (optional) - Callback function

This operation closes the response(s) object(s) matching the `target` argument and frees up resources. If no `target` argument is provided, all connections will be closed.

Once a connection has been closed, it can't be sent down any more data.

Clients that close the connection on their own will be automatically unregistered from the service.

> **Note** Due to the optional nature of both the `target` and `cb` arguments, if `sseService.unregister` is called
> with only one function as its argument, this function will be considered as the callback. This behaviour will be applied to all methods having a `target` argument.

### `sseService.use(...middlewares)`

Adds the middleware sequence to the middleware stack.

A middleware is an object implementing various lifecycle hooks for the sseService's methods.

Depending on their nature, hooks are 

 - either invoked downstream or upstream
 - either synchronous or asynchronous 

See below for a description of those terms.

At the moment, three hooks are currently supported. Each of them is described below, along with an 'identity' implementation.

```javascript
sseService.use({
  /**
   * [Asynchronous - downstream]
   * The connection has been accepted by the sseService but not registered yet.
   * This lifecycle hook MUST NOT send any header/data to the response.
   * <next> accepts an optional error as only argument.
   */
  beforeRegister: (sseService, req, res, next) => {
    next();
  },

  /**
   * [Asynchronous - upstream]
   * The connection has been registered by the sseService and has been assigned an sseID. 
   * Data can be sent down at this point.
   * This middleware occurs right before the 'connection' event is emitted.
   * <next> accepts an optional error as only argument.
   */
  afterRegister: (sseService, sseId, next) => {
    next();
  },

  /**
   * [Synchronous - downstream]
   * Data is about to be sent to (potentially several) connection(s). 
   * This hook gives the opportunity to implement message formatting logic.
   */
  transformSend: payload => {
    return payload;
  }
});
```

**downstream vs upstream**

`sseService.use({downStreamHook1}, {downStreamHook2})` invokes hook in the same order (hook1, then hook2)

`sseService.use({upStreamHook1}, {upStreamHook2})` invokes hook in reverse order (hook2, then hook1)

**synchronous vs asynchronous**

Synchronous hooks are pure functions that return the exact same number of arguments they receive. On invocation, such hooks are composed together (as in `f(g(x))`).

Asynchronous hooks receive a `next` function as last argument. This function MUST be called when the hook has finished its job, with possibly an error as only argument. On invocation, asynchronous hooks are composed together in a waterfall sequence. They do not pass data along to each other.

# Support

Supports Node.js 6.x and above.

Implementation of this specification is expected to use Node.js core methods to respond to the client, in particular `ServerResponse.writeHead()`, `ServerResponse.write()` and `ServerResponse.end()`.
For this reason, it is **does not support Koa.js**, that has its own way of handling responses (see http://koajs.com/#context)