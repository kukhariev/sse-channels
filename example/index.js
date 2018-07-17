'use strict';

const http = require('http');
const { SseChannels } = require('../lib/');
const path = require('path');
const url = require('url');
const fs = require('fs');
const sse = new SseChannels({ retryInterval: 20000 });
sse.on('connected', client => {
  sse.publish(`+++ ${client.channel} connected (Broadcast Message)`);
});
sse.on('disconnected', client => {
  sse.publish(`--- ${client.channel} disconnected (Broadcast Message)`);
});
http
  .createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = `.${parsedUrl.pathname}`;

    if (pathname.startsWith('./stream')) {
      //
      sse.subscribe(req, res, parsedUrl.query.ch);
    } else if (pathname.startsWith('./')) {
      pathname = './index.html';
      const data = fs.readFileSync(path.resolve(__dirname, pathname));
      res.setHeader('Content-type', 'text/html');
      res.end(data);
    } else {
      res.statusCode = 404;
      res.end('Page not found!');
    }
  })
  .listen(3005);

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
