import { expect, test } from "bun:test";
import { waitForRelayOutboxSchema } from "./ckb-event-relay-worker.ts";

test("relay worker waits for the EffectStream outbox migration", async () => {
  let reads = 0;
  const database = {
    async query() {
      reads++;
      return { rows: [{ table_name: reads < 2 ? null : "effectstream.ckb_evm_relay_outbox" }] };
    },
  } as any;
  await waitForRelayOutboxSchema(database, 2_000);
  expect(reads).toBe(2);
});

test("relay worker reports a missing outbox migration with actionable detail", async () => {
  const database = {
    async query() { return { rows: [{ table_name: null }] }; },
  } as any;
  await expect(waitForRelayOutboxSchema(database, 1)).rejects.toThrow(
    "effectstream.ckb_evm_relay_outbox",
  );
});
