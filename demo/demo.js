const Client = require("../client");

const client = new Client({ host: "localhost" });

let changeStream = client.watch("test", { type: "in" });

changeStream.on("change", data => {
  console.log("change data", data);
});

setTimeout(() => {
  changeStream.close();
}, 10000);
