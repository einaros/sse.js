const http = require('http');
const path = require('path');
const express = require('express');
const sseService = require('./sse-service');

const app = express();

app.use('/sse', sseService.register);
app.use('/', express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
server.listen(9530, err => {
  if(err) throw err;
  console.log('Server is up on port 9530. Please, visit http://localhost:9530');
});