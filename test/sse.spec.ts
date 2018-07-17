import chai = require('chai');
const expect = chai.expect;
import * as EventSource from 'eventsource';
import { createServer } from 'http';
import * as url from 'url';
import { SseChannels } from '../src/';

const PORT = 5005;
const delay = time => {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
};

const sse = new SseChannels({ retryInterval: 2000 });
sse.on('error', err => console.error(err));

let server;
const clients: { [key: string]: EventSource } = {};

describe('SseChannels', () => {
  before('start server', () => {
    server = createServer(async (req, res) => {
      const urlParsed = url.parse(req.url, true);
      const { channel } = await sse.subscribe(
        req,
        res,
        `room=${+urlParsed.query.room}`
      );
    });
    server.listen(PORT);
  });

  it('open connection', () => {
    const client = new EventSource(`http://localhost:${PORT}/stream?room=1`);
    clients['room=1'] = client;
    client.onopen = evt => {
      expect(sse.connections.length).to.be.eq(1);
      return Promise.resolve();
    };
  });

  it('set retry interval', async () => {
    let i = 100;
    while (clients['room=1']['reconnectInterval'] !== 2000 && --i) {
      await delay(1);
    }
    expect(clients['room=1']['reconnectInterval']).to.be.eq(2000);
  });

  it('other connect', () => {
    const client = new EventSource(`http://localhost:${PORT}/stream?room=2`);
    clients['room=2'] = client;
    client.onopen = e => {
      return Promise.resolve(expect(sse.connections.length).to.be.eq(2));
    };
  });

  it('get channels', () => {
    expect(sse.channels.length).to.be.eq(2);
  });

  it('send event to all', async () => {
    const p0 = new Promise(resolve => {
      clients['room=1'].onmessage = resolve;
    });
    const p1 = new Promise(resolve => {
      clients['room=2'].onmessage = resolve;
    });
    sse.publish({ test: 'broadcast' });
    const [r1, r2] = await Promise.all([p0, p1]);
    expect(r1).to.have.any.keys('type', 'data');
  });

  it('send message to specific clients', async () => {
    return new Promise((resolve, reject) => {
      sse.send(
        'message',
        { test: 'test' },
        sse.connections.filter(cl => cl.req.url === '/stream?room=1')
      );
      clients['room=1'].onmessage = resolve;
      clients['room=2'].onmessage = reject;
    });
  });

  it('publish event to channel', () => {
    return new Promise((resolve, reject) => {
      sse.publish(`room=2`, { test: 'test' });
      clients['room=1'].onmessage = msg => reject(msg);
      clients['room=2'].onmessage = msg => resolve(msg);
    });
  });
  it('publish vent to channel (regex)', () => {
    const p0 = (clients['room=1'].onmessage = msg => Promise.resolve(msg));
    const p1 = (clients['room=2'].onmessage = msg => Promise.resolve(msg));
    sse.publish(/room:\d/i, { test: 'test' });
    return Promise.all([p0, p1]);
  });

  it('publish `test` type event to channel', () => {
    return new Promise((resolve, reject) => {
      sse.publish(`room=2`, 'test', { test: 'test' });
      clients['room=1'].onmessage = msg => reject(msg);
      clients['room=2'].addEventListener('test', msg => resolve(msg));
    });
  });
  it('unsubscribe', async () => {
    try {
      await sse.unsubscribe(sse.connections[0]);
      while (sse.connections.length === 2) {
        await delay(10);
      }
    } finally {
      expect(sse.connections.length).to.be.eq(1);
    }
  });
  it('close on clients disconnect', async () => {
    for (const client in clients) {
      clients[client].close();
    }
    let i = 100;
    while (sse.connections.length && i--) {
      await delay(1);
    }
    expect(sse.connections.length).to.be.eq(0);
  });

  after('close server', () => {
    return server.close();
  });
});
