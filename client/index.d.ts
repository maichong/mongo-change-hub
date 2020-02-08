import events = require("events");

declare namespace MongoChangeHubClient {
  class Watcher extends events.EventEmitter {
    id: string;
    db: string;
    collection: string;
    filters: any;
    client: MongoChangeHubClient;
    count: number;

    addListener(event: "change", fn: (change: any) => void): this;
    addListener(event: "close", fn: () => void): this;

    on(event: "change", fn: (change: any) => void): this;
    on(event: "close", fn: () => void): this;

    once(event: "change", fn: (change: any) => void): this;
    once(event: "close", fn: () => void): this;

    prependListener(event: "change", fn: (change: any) => void): this;
    prependListener(event: "close", fn: () => void): this;

    onprependOnceListenerce(event: "change", fn: (change: any) => void): this;
    prependOnceListener(event: "close", fn: () => void): this;

    removeListener(event: "change", fn: (change: any) => void): this;
    removeListener(event: "close", fn: () => void): this;

    close(): void;
  }

  interface Options {
    host: string;
    port?: number;
  }
}

declare class MongoChangeHubClient {
  constructor(options: MongoChangeHubClient.Options);
  watch(
    db: string,
    collection: string,
    filters?: any
  ): MongoChangeHubClient.Watcher;
}

export = MongoChangeHubClient;
