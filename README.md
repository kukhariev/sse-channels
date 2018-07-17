# sse-channels

> Node Server-Sent Events middleware

[![Build status][travis-image]][travis-url]
[![npm version][npm-image]][npm-url]

## Install

```sh
npm install --save @dropb/sse-channels
```

## Usage

```js
const { SseChannels } = require('@dropb/sse-channels');
const express = require('express');
const { join } = require('path');

const app = express();
app.get('/', (req, res) => {
  res.sendFile(join(`${__dirname}/index.html`));
});
const sse = new SseChannels();
sse.on('connected', client => {
  sse.send('message', `+++ ${client.req.query.ch} connected`);
});
sse.on('disconnected', client => {
  sse.send('message', `--- ${client.req.query.ch} disconnected`);
});
app.use('/stream', (req, res) => {
  sse.subscribe(req, res, req.query.ch);
});

setInterval(() => {
  sse.channels.forEach(ch => {
    sse.publish(
      ch,
      `data: ${Math.random().toFixed(4)} channels: ${
        sse.channels.length
      } clients: ${sse.connections.length}`
    );
  });
}, 3000);

app.listen(3005);
```

## API

### SseChannels([options]);

Available options are:

- `retryInterval` (integer): set clients reconencting time
- `pingInterval` (integer):

### subscribe(req, res, [channel])

attach to HTTP request

- `channel` (string): assign `channel`

### unsubscribe(client);

drop client

### publish(...parameters)

send events to channels.

```ts
publish(eventObject: SseEvent): void;
publish(data: any): void;
publish(channels: string | string[] | RegExp, eventObject: SseEvent): void;
publish(channels: string | string[] | RegExp, data: any): void;
publish(channels: string | string[] | RegExp, event: string, data: any): void;
```

### send(eventName, data, [clients])

send events to clients.

- `eventName`(string): event name. Defaults: "message"
- `data`: event data
- `clients`(array) clients list

### findClients([channel])

clients list filtered by `channel`

- `channel`(string | string[] | RegExp)

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/@dropb/sse-channels.svg
[npm-url]: https://www.npmjs.com/package/@dropb/sse-channels
[travis-image]: https://travis-ci.org/kukhariev/sse-channels.svg?branch=master
[travis-url]: https://travis-ci.org/kukhariev/sse-channels
