import { EventEmitter } from 'events';

import { IncomingMessage, ServerResponse } from 'http';

export type SseClient = {
  req: IncomingMessage;
  res: ServerResponse;
  channel: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventData = string | number | boolean | Record<string, any> | null;
export type SseEvent = {
  data: EventData;
  id?: number;
  event?: string;
  type?: string;
  channel?: string | string[] | RegExp;
};

function isSseEvent(value: unknown): value is SseEvent {
  return value && typeof value === 'object' && 'data' in value;
}

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
    const index = this.connections.indexOf(client);
    if (index >= 0) {
      this.connections.splice(index, 1);
    }
    if (this.connections.length === 0 && this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  subscribe(req: IncomingMessage, res: ServerResponse, channel = '*'): Promise<SseClient> {
    return new Promise((resolve) => {
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
        this.connections.forEach((client) => {
          client.res.write(':\n');
        });
      }, this.pingInterval);
    }
  }

  unsubscribe(client: SseClient): Promise<void> {
    return new Promise((resolve) => {
      client.res.statusCode = 410;
      client.res.end(() => {
        resolve();
      });
    });
  }

  send(eventName: string, data: EventData, clients: SseClient[] = this.connections): void {
    let body: string = typeof data === 'object' ? JSON.stringify(data) : String(data);
    body =
      `id: ${this.lastId++}\n` +
      body
        .split(/[\r\n]+/)
        .map((str) => `data: ${str}`)
        .join('\n') +
      '\n\n';

    if (eventName !== 'message') {
      body = `event: ${eventName}\n`.concat(body);
    }
    this.emit('send', clients, body);
    clients.forEach((client) => {
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
      return this.connections.filter(({ channel }) => search.some((c) => channel === c));
    }
    return this.connections.filter(({ channel }) => search === channel);
  }

  publish(eventObject: SseEvent): void; //
  publish(data: EventData): void; //
  publish(channels: string | string[] | RegExp, eventObject: SseEvent): void; //
  publish(channels: string | string[] | RegExp, data: EventData): void;
  publish(channels: string | string[] | RegExp, event: string, data: EventData): void; //

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publish(...args: any[]): void {
    const eventObject: SseEvent = {
      event: 'message',
      data: {},
      channel: /.*/
    };
    if (args.length === 1) {
      if (isSseEvent(args[0])) {
        Object.assign(eventObject, args[0]);
      } else {
        eventObject.data = args[0] as EventData;
      }
    }
    if (args.length === 2) {
      eventObject.channel = args[0] as string | string[] | RegExp;
      if (isSseEvent(args[1])) {
        Object.assign(eventObject, args[1]);
      } else {
        eventObject.data = args[1] as EventData;
      }
    } else if (args.length === 3) {
      eventObject.data = args[2] as EventData;
      eventObject.channel = args[0] as string | string[] | RegExp;
      eventObject.event = args[1] as string;
    }

    this.send(eventObject.event, eventObject.data, this.findClients(eventObject.channel));
  }
}

export { SseChannels };
