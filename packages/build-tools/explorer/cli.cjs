#!/usr/bin/env node

const { createServer } = require("http-server");

const server = createServer({ root: __dirname + "/client/dist" });
const port = process.env.PAIMA_EXPLORER_PORT || 10590;
server.listen(port, () => {
  console.log(`Paima Explorer at http://localhost:${port}`);
});
