// Child process for the acceptance-atomicity test: accepts requests as fast as
// it can and reports each one the storage said it had committed, until someone
// kills it.
//
// `writeSync(1, …)` rather than `console.log`, for the same reason as
// `crash-writer.ts`: the report must reach the parent as a syscall, not sit in
// a userland buffer that a SIGKILL would discard. Anything this process claims
// to have accepted, the parent will demand to find — as a queue row AND as a
// status record, never one without the other.

import { writeSync } from "node:fs";
import { DatabaseStorage } from "../../core/database-storage.ts";
import { computeRequestId } from "../../core/request-id.ts";
import type { DefaultBatcherInput } from "../../core/types.ts";

const dataDirectory = process.argv[2];
if (!dataDirectory) {
  throw new Error("accept-crash-writer: expected a data directory argument");
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
  const requestId = computeRequestId(input, "product-a");
  await storage.recordAccepted(requestId, input, "product-a", `replay-${i}`);
  writeSync(1, `ACCEPTED ${i} ${requestId}\n`);
}
