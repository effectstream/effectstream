// Child process for the durability test: writes inputs into a DatabaseStorage
// as fast as it can and reports each one the storage said it had committed,
// until someone kills it.
//
// The report goes out with `writeSync(1, …)` rather than `console.log` on
// purpose: it must reach the parent's pipe as a syscall, not sit in a userland
// buffer that a SIGKILL would discard. Anything this process claims to have
// committed, the parent will demand to find after the restart.

import { writeSync } from "node:fs";
import { DatabaseStorage } from "../../core/database-storage.ts";
import type { DefaultBatcherInput } from "../../core/types.ts";

const dataDirectory = process.argv[2];
if (!dataDirectory) {
  throw new Error("crash-writer: expected a data directory argument");
}

const storage = new DatabaseStorage({ dataDirectory });
await storage.init("product-a");
writeSync(1, "READY\n");

for (let i = 0; ; i += 1) {
  const input: DefaultBatcherInput = {
    addressType: 5,
    address: "addr-crash",
    input: `payload-${i}`,
    timestamp: String(i),
    signature: `sig-${i}`,
    target: "product-a",
  };
  await storage.addInput(input, "product-a");
  writeSync(1, `COMMITTED ${i}\n`);
}
