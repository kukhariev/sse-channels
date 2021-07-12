import { EventEmitter } from 'events';

import { IncomingMessage, ServerResponse } from 'http';

export type SseClient = {
  req: IncomingMessage;
  res: ServerResponse;
  channel: string;
};

export type SseEvent = {
  data: unknown;
  id?: number;
  event?: string;
  type?: string;
  channel?: string | string[] | RegExp;
};

function isRegExp(params: unknown): params is RegExp {
  return params instanceof RegExp;
}
class SseChannels extends EventEmitter {
  public get channels(): string[] {
    const channelsSet: Set<string> = new Set();
    this.connections.forEach(({ channel }) => {
      channelsSet.add(channel);
    });
    return Array.from(channelsSet);
  }
  private lastId = 1;
  public connections: SseClient[] = [];
  private pingTimer: NodeJS.Timeout;
  public retryInterval: number;
  public pingInterval: number;
  protected headers = {
    'Content-Type': 'text/event-stream;charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  };

  constructor(options: { retryInterval?: number; pingInterval?: number } = {}) {
    super();
    this.retryInterval = options.retryInterval || 1000;
    this.pingInterval = options.pingInterval || 10000;
  }

  private removeClient(client: SseClient): void {
    this.connections.splice(this.connections.indexOf(client), 1);
    if (this.connections.length === 0) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  subscribe(req: IncomingMessage, res: ServerResponse, channel = '*'): Promise<SseClient> {
    return new Promise(resolve => {
      const client: SseClient = { req, res, channel };
      res.on('close', () => {
        this.emit('disconnected', client);
        this.removeClient(client);
      });
      res.connection.setNoDelay(true);
      res.writeHead(200, this.headers);
      res.write(`retry: ${this.retryInterval}\n\n`, () => {
        this.connections.push(client);
        this.handshake();
        this.emit('connected', client);
        resolve(client);
      });
    });
  }

  protected handshake(): void {
    if (!this.pingTimer && typeof this.pingInterval === 'number') {
      this.pingTimer = setInterval(() => {
        this.connections.forEach(client => {
          client.res.write(':\n');
        });
      }, this.pingInterval);
    }
  }

  unsubscribe(client: SseClient): Promise<void> {
    return new Promise(resolve => {
      client.res.statusCode = 410;
      client.res.end(() => {
        this.emit('disconnected', client);
        this.removeClient(client);
        resolve();
      });
    });
  }

  send(
    eventName: string,
    data: string | number | Record<string, any>,
    clients: SseClient[] = this.connections
  ): void {
    let body: string = typeof data === 'object' ? JSON.stringify(data) : String(data);
    body =
      `id: ${this.lastId++}\n` +
      body
        .split(/[\r\n]+/)
        .map(str => `data: ${str}`)
        .join('\n') +
      '\n\n';

    if (eventName !== 'message') {
      body = `event: ${eventName}\n`.concat(body);
    }
    this.emit('send', clients, body);
    clients.forEach(client => {
      client.res.write(body);
    });
  }

  findClients(search?: string | string[] | RegExp): SseClient[] {
    if (!search) {
      return this.connections;
    } else if (isRegExp(search)) {
      const reg = search;
      return this.connections.filter(({ channel }) => reg.test(channel));
    } else if (Array.isArray(search)) {
      return this.connections.filter(({ channel }) => search.some(c => channel === c));
    }
    return this.connections.filter(({ channel }) => search === channel);
  }

  publish(eventObject: SseEvent): void;
  publish(data: any): void;
  publish(channels: string | string[] | RegExp, eventObject: SseEvent): void;
  publish(channels: string | string[] | RegExp, data: any): void;
  publish(channels: string | string[] | RegExp, event: string, data: any): void;

  publish(channels, event?, data?) {
    if (!event && !data) {
      event = channels;
      channels = event.channel || /.*/;
    }
    if (typeof event === 'string' && data) {
      data = data;
    } else if (event.event || event.type) {
      data = event.data;
      event = event.event || event.type;
    } else {
      data = event;
      event = 'message';
    }
    this.send(event, data, this.findClients(channels));
  }
}

export { SseChannels };
