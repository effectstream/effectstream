import pg from "../../../db/node_modules/pg";
import net from "node:net";
import {
  midnightContract,
  pglite,
  runNode,
} from "../../src/single-file.ts";

const originalPoolEnd = pg.Pool.prototype.end;
const originalServerClose = net.Server.prototype.close;
pg.Pool.prototype.end = async function () {
  console.info("SINGLE_FILE_POOL_END");
  return await originalPoolEnd.call(this);
};
net.Server.prototype.close = function (...args: Parameters<net.Server["close"]>) {
  const address = this.address();
  if (address && typeof address !== "string") {
    console.info(`SINGLE_FILE_SERVER_CLOSE:${address.port}`);
  }
  return originalServerClose.apply(this, args);
};

const initialSignalListeners = process.listenerCount("SIGTERM");
const signalPoll = setInterval(() => {
  if (process.listenerCount("SIGTERM") > initialSignalListeners) {
    clearInterval(signalPoll);
    console.info("SINGLE_FILE_SEND_SIGTERM");
    process.kill(process.pid, "SIGTERM");
  }
}, 10);

await runNode({
  appName: "single-file-sigterm-fixture",
  apiPort: 18999,
  database: pglite({ port: 0 }),
  sources: {
    counter: midnightContract({
      network: "preview",
      address: "a".repeat(64),
      startBlockHeight: 0,
      ledger: { round: "uint128" },
      indexer: "http://127.0.0.1:18998/graphql",
    }),
  },
  transitions: {
    counter: () => {},
  },
});

console.info("SINGLE_FILE_EXIT_ZERO");
