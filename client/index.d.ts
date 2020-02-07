import events = require("events");

declare namespace MongoChangeHubClient {
  class Watcher extends events.EventEmitter {
    on(event: "change", fn: (change: any) => void);
    close(): void;
  }

  interface Options {
    host: string;
    port?: number;
  }
}

declare class MongoChangeHubClient {
  constructor(options: MongoChangeHubClient.Options);
  watch(collection: string, filters?: any): MongoChangeHubClient.Watcher {}
}

export = MongoChangeHubClient;
