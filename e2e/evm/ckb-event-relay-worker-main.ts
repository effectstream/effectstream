import { getConnection } from "@effectstream/db";
import { runCkbRelayWorker, waitForRelayOutboxSchema } from "./tooling/ckb-event-relay-worker.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
const db = getConnection();
try {
  await waitForRelayOutboxSchema(db, 120_000, controller.signal);
  await runCkbRelayWorker(db, controller.signal);
} finally {
  await db.end();
}
