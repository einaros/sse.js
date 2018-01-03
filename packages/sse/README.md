# SSE

An unopinionated, minimalist, [standard](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events)-focused API for managing Server-Sent Events (SSE) in Node.js.

**Node.js**

```javascript
const http = require('http');
const { SSEService } = require('sse');

const sseService = new SSEService();
http.createServer((request, response) => {
  if(request.method === 'GET' && request.url === '/sse')
    sseService.register(request, response);
}).listen(8080);

sseService.on('connection', sseId => {
  sseService.send('hello', sseId); // sends data to a single response
  sseService.send({event:'user-connected'}); // broadcasts data to all responses
});
```

**Express.js**

```javascript
const http = require('http');
const express = require('express');
const { SSEService } = require('sse');

const app = express();
const sseService = new SSEService();

app.get('/sse', sseService.register);

http.createServer(app).listen(8080);

sseService.on('connection', sseId => {
  sseService.send('hello', sseId); // sends data to a single response
  sseService.send({event:'user-connected'}); // broadcasts data to all responses
})
```

# Overview 

Server-Sent Events are entirely managed by an `sseService`. This service guarantees consistency with respect to the [EventSource specification](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events), provided that the server delegates the request to the `sseService` without sending any headers/data to the response.

The `sseService` allows to send data with fine-grained targeting on the open SSE connections.

# API

 * [Class sse.SSEService](#class-ssesseservice)
     * [new sse.SSEService()](#new-ssesseservice)
     * [Class: sseService.SSEID](#class-sseservicesseid)
        * [sseId.isConnectionActive](#sseidisconnectionactive)
        * [sseId.sseService](#sseidsseservice)
     * [Event: 'clientClose'](#event-clientclose)
     * [Event: 'connection'](#event-connection)
     * [Event: 'error'](#event-error)
     * [sseService.close([cb])](#sseserviceclosecb)
     * [sseService.numActiveConnections](#sseservicenumactiveconnections)
     * [sseService.register(req, res)](#sseserviceregisterreq-res)
     * [sseService.resetLastEventId([cb])](#sseserviceresetlasteventidcb)
     * [sseService.send(opts[, target[, cb]])](#sseservicesendopts-target-cb)
     * [sseService.unregister([target[, cb]])](#sseserviceunregistertarget-cb)


## Class `sse.SSEService`

### `new sse.SSEService()`

Sets up a new `SSEService`.

While it is allowed to have multiple instances of an `SSEService` on the same server, it is *not* recommended as doing so would multiply the number of open connections to that server, consuming resources unnecessarily. 

### Class: `sseService.SSEID`

Identifier object that represents an SSE connection managed by the `sseService`. An `sseId` can only be created by the service. 

#### `sseId.isConnectionActive`

Boolean indicating if the connection is active.

 - `true` if this `sseId` represents an active SSE connection.
 - `false` if the connection is closed and no longer managed by the service.

A closed connection can no longer accept Server-Sent Events.

#### `sseId.sseService`

Reference to the `sseService` that issued this `sseId`.

### Event: 'clientClose'

  - `sseId {sse.SSEID}` - Connection's SSE identifier
  - `locals {Object}` - The `res.locals` object of the connection

Event emitted when the client closed the connection

### Event: 'connection'

  - `sseId {SSEID}` - Connection's SSE identifier
  - `locals {Object}` - The `res.locals` object of the connection
  
Event emitted when an SSE connection has been successfully established
  
Example :

    sseService.on('connection', (sseId, {userName}) => {
      sseService.send('greetings', sseId);   
      sseService.send(userName, 'userConnected');
    });
    
### Event: 'error'

  - `err {Error}` - The error

Event emitted when an error occurred during SSE connection's establishment.

### `sseService.close([cb])`

  - `cb {function}` (optional) - Callback function

Closes the service by terminating all open connections, and frees up resources. The service won't accept any more connection. 
Further incoming connections will be terminated immediately with a `204` HTTP status code, preventing clients from attempting to reconnect.

### `sseService.numActiveConnections`

Number of active SSE connections managed by this service (read-only).

### `sseService.register(req, res)`

  - `req {http.IncomingMessage}` - The incoming HTTP request
  - `res {http.ServerResponse}` - The server response

Sets up an SSE connection by doing the following :

  - sends appropriate HTTP headers to the response 
  - maintains connection alive with the regular sending of heartbeats
  - assigns an `sseId` to the response and extends the `res.locals` object with an `sse` property :
    - `res.locals.sse.sseId {object}` : the `sseId` assigned to the response
    - `res.locals.sse.lastEventId {string}` (optional) : the `Last-Event-ID` HTTP header specified in `req`, if any 
       
The connection will be rejected if the `Accept` header in the `req` object is not set to `'text/event-stream'`.
 
This function accepts no callback, to avoid subsequent code to possibly sending data to the `res` object. 
Instead, the service will emit a 'connection' event if the connection was successful. If not, it will emit an 'error' event.

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

# Support

Supports Node.js 6.x and above.

Implementation of this specification is expected to use Node.js core methods to respond to the client, in particular `ServerResponse.writeHead()`, `ServerResponse.write()` and `ServerResponse.end()`.
For this reason, it is **does not support Koa.js**, that has its own way of handling responses (see http://koajs.com/#context)