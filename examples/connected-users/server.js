const http = require('http');
const path = require('path');
const express = require('express');
const sseService = require('./sse-service');

const app = express();

app.use('/sse', sseService.register);
app.use('/', express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
server.listen(8080, err => {
  if(err) throw err;
  console.log('Server is up on port 8080. Please, visit http://localhost:8080');
});