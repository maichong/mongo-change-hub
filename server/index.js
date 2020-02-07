const URI = process.env.URI || error("env URI is required!");
const DB = process.env.DB || error("env DB is required!");

const net = require("net");
const bson = require("bson");
const mongodb = require("mongodb");
const endBuffer = Buffer.from("\n\n");

function error(msg) {
  console.error(msg);
  process.exit(1);
}

function compare(a, b) {
  let type = typeof a;
  if (type !== typeof b) return false;
  switch (type) {
    case "array":
      return;
    case "object":
      if (a === null || b === null) return a === b;
      if (isPlainObject(a)) {
        return isPlainObject(b) && compareObject(a, b);
      }
      return String(a) === String(b);
    default:
      return a === b;
  }
}

function compareObject(a, b) {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (let k in a) {
    if (!compare(a[k], b[k])) return false;
  }
  return true;
}

function compareArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i in a) {
    if (!compare(a[i], b[i])) return false;
  }
  return true;
}

function filtersToMatch(filters) {
  let match = {};
  for (let key of Object.keys(filters)) {
    let nkey = key;
    if (nkey[0] !== "$") {
      nkey = `fullDocument.${key}`;
    }
    let value = filters[key];
    if (isPlainObject(value)) {
      value = filtersToMatch(value);
    }
    match[nkey] = value;
  }
  return match;
}

function isPlainObject(input) {
  if (Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(input);
  return prototype === null || prototype === Object.getPrototypeOf({});
}

const server = net.createServer();
const clients = new Map();
const watchers = new Map();
const streams = new Map();

mongodb
  .connect(URI, {
    useUnifiedTopology: true
  })
  .then(client => {
    const db = client.db(DB);

    function watch(client, action) {
      if (!action.collection || !action.watcher) {
        client.close();
        return;
      }
      const filters = action.filters || {};
      console.log(client.remoteAddress, "watch", action.collection, filters);
      let stream;
      for (let s of streams.values()) {
        if (s.collection === action.collection && compare(filters, s.filters)) {
          stream = s;
          break;
        }
      }

      if (!stream) {
        stream = new Stream(db, action.collection, filters);
        streams.set(stream.id, stream);
      }

      const watcher = new Watcher(
        action.watcher,
        action.collection,
        filters,
        client,
        stream
      );

      watchers.set(watcher.id, watcher);
      stream.watchers.set(watcher.id, watcher);

      stream.start();
    }

    function cancel(client, action) {
      if (!action.watcher) {
        client.close();
        return;
      }
      let watcher = watchers.get(action.watcher);
      if (!watcher) return;
      console.log(
        client.remoteAddress,
        "cancel",
        watcher.collection,
        watcher.filters
      );

      watcher.cancel();
    }

    server.on("connection", client => {
      console.log("new client", client.remoteAddress);
      client.id = String(new bson.ObjectID());
      clients.set(client.id, client);

      client.on("data", buffer => {
        const data = bson.deserialize(buffer);
        if (data.action === "watch") {
          watch(client, data);
        } else if (data.action === "cancel") {
          cancel(client, data);
        }
      });

      client.on("close", () => {
        console.log("client closed", client.remoteAddress);
        clients.delete(client.id);
        for (let watcher of watchers.values()) {
          if (watcher.client === client) {
            watcher.cancel();
          }
        }
      });
    });

    server.listen(37017, () => {
      console.log("server started");
    });
  })
  .catch(error);

class Stream {
  constructor(db, collection, filters) {
    this.id = String(new bson.ObjectID());
    this.db = db;
    this.collection = collection;
    this.filters = filters;
    this.watchers = new Map();
  }

  start() {
    if (this.changeStream) return;

    console.log("start", this.collection, this.filters);
    let pipeline = [];
    if (Object.keys(this.filters).length) {
      pipeline.push({ $match: filtersToMatch(this.filters) });
    }
    this.changeStream = this.db.collection(this.collection).watch(pipeline, {
      fullDocument: "updateLookup",
      batchSize: 100
    });

    this.changeStream.on("change", data => {
      for (let watcher of this.watchers.values()) {
        let change = { watcher: watcher.id, data };
        let buffer = bson.serialize(change);
        buffer = Buffer.concat([Buffer.allocUnsafe(4), buffer, endBuffer]);
        buffer.writeInt32LE(buffer.length);
        watcher.client.write(buffer);
      }
    });
  }

  stop() {
    if (!this.changeStream) return;
    console.log("stop", this.collection, this.filters);
    this.changeStream.close();
    this.changeStream.removeAllListeners();
    this.changeStream = null;
    this.db = null;
  }
}

class Watcher {
  constructor(id, collection, filters, client, stream) {
    this.id = id;
    this.collection = collection;
    this.filters = filters;
    this.client = client;
    this.stream = stream;
  }

  cancel() {
    watchers.delete(this.id);
    let stream = this.stream;
    delete this.stream;
    delete this.client;
    stream.watchers.delete(this.id);
    if (!stream.watchers.size) {
      stream.stop();
      streams.delete(stream.id);
    }
  }
}