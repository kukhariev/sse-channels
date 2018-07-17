'use strict';

const { SseChannels } = require('../lib/');
const express = require('express');
const { join } = require('path');

const app = express();
app.get('/', (req, res) => {
  res.sendFile(join(`${__dirname}/index.html`));
});
const sse = new SseChannels();
sse.on('connected', client => {
  sse.send(
    'message',
    `+++ ${client.req.query.ch} connected (Broadcast Message)`
  );
});
sse.on('disconnected', client => {
  sse.send(
    'message',
    `--- ${client.req.query.ch} disconnected (Broadcast Message)`
  );
});
app.use('/stream', (req, res) => {
  sse.subscribe(req, res, req.query.ch);
});
setInterval(() => {
  sse.channels.forEach(ch => {
    sse.publish(
      ch,
      `data: ${Math.random().toFixed(2)} channelsCount: ${
        sse.channels.length
      } clientsCount: ${sse.connections.length}`
    );
  });
}, 3000);
console.log('Open http://localhost:3005 in your browser');
app.listen(3005);
