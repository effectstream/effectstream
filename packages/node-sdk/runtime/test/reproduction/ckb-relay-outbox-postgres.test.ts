import { afterAll, expect, test } from "bun:test";
import type { Pool } from "pg";
import type { CkbCellCreatedEventV1 } from "ckb-multichain-connector";
import { processNextRelayIntent, type RelayExecutor } from "../../../../../e2e/evm/tooling/ckb-event-relay-worker.ts";
import { processFixtureThroughRuntime } from "../../../../../e2e/evm/tooling/ckb-to-evm-relay.test.ts";
import { normalizeCkbEvent, relayPayloadHash } from "../../../../../e2e/evm/tooling/ckb-event-relay.ts";
import { postgresAvailable, setupHarness, type Harness } from "./harness.ts";
import type { Hex, Address } from "viem";

const destinationContract = "0x0000000000000000000000000000000000000001" as Address;
const destinationConfig = {
  rpcUrl: "http://127.0.0.1:8545",
  chainId: 31337,
  contractAddress: destinationContract,
} as const;
const relayEventId = (digit: string) => `ckb-cell-created:${digit.repeat(64)}`;
const blockHash = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const itWithPostgres = process.env.PGLITE === "false" && postgresAvailable() ? test : test.skip;

let harness: Harness | undefined;
afterAll(async () => harness?.teardown());

itWithPostgres("real PostgreSQL commits CKB relay intent atomically and resumes leased work", async () => {
  harness = await setupHarness({ backend: "postgres" });
  await harness.runToHeight({
    events: [],
    tips: { mainClock: 1, parallelP: 2 },
    target: 1,
    apiPort: 19441,
  });
  const pool = harness.pool;

  const sourceEvent = await processFixtureThroughRuntime(pool, {
    rootHeight: 1_000_000_000,
    contractAddress: destinationContract,
  });
  const committed = await pool.query<{
    status: string;
    source_event: CkbCellCreatedEventV1;
    row_count: string;
    page_number: number;
  }>(
    `SELECT o.status, o.source_event,
            (SELECT count(*) FROM effectstream.primitive_accounting
              WHERE effectstream_block_height = 1000000000 AND payload->>'eventId' = o.event_id)::text AS row_count,
            (SELECT max(page_number) FROM effectstream.sync_protocol_pagination
              WHERE protocol_name = 'ckb-relay-fixture') AS page_number
       FROM effectstream.ckb_evm_relay_outbox o
      WHERE o.event_id = $1 AND o.destination_chain_id = 31337 AND o.destination_contract = $2`,
    [sourceEvent.eventId, destinationContract],
  );
  expect(committed.rows).toHaveLength(1);
  expect(committed.rows[0]).toMatchObject({ status: "processed", row_count: "1", page_number: 1 });
  expect(committed.rows[0]?.source_event.eventId).toBe(sourceEvent.eventId);

  await processFixtureThroughRuntime(pool, {
    rootHeight: 1_000_000_001,
    contractAddress: destinationContract,
  });
  const duplicateCount = await pool.query(
    `SELECT count(*)::int AS count FROM effectstream.ckb_evm_relay_outbox
      WHERE event_id = $1 AND destination_chain_id = 31337 AND destination_contract = $2`,
    [sourceEvent.eventId, destinationContract],
  );
  expect(duplicateCount.rows[0]?.count).toBe(1);

  const failedEventId = relayEventId("f");
  await expect(processFixtureThroughRuntime(pool, {
    rootHeight: 1_000_000_002,
    eventId: failedEventId,
    invalidResumePage: true,
    contractAddress: destinationContract,
  })).rejects.toThrow();
  const rollbackEvidence = await pool.query(
    `SELECT
       (SELECT count(*) FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1)::int AS intents,
       (SELECT count(*) FROM effectstream.primitive_accounting
         WHERE effectstream_block_height = 1000000002 AND payload->>'eventId' = $1)::int AS accounting,
       (SELECT count(*) FROM effectstream.effectstream_blocks WHERE block_height = 1000000002)::int AS roots,
       (SELECT max(page_number) FROM effectstream.sync_protocol_pagination
         WHERE protocol_name = 'ckb-relay-fixture')::int AS page_number`,
    [failedEventId],
  );
  expect(rollbackEvidence.rows[0]).toEqual({ intents: 0, accounting: 0, roots: 0, page_number: 1 });

  const initialHash = relayPayloadHash(normalizeCkbEvent(sourceEvent), 31337n, destinationContract);
  const submittedTx = blockHash("a");
  let submissions = 0;
  const interrupted: RelayExecutor = {
    recover: async () => null,
    submit: async (_intent, onSubmitted) => {
      submissions++;
      await onSubmitted(submittedTx, initialHash);
      throw new Error("simulated process stop after tx hash persistence");
    },
  };
  expect(await processNextRelayIntent(pool, interrupted)).toBe(true);
  const afterStop = await outboxState(pool, sourceEvent.eventId);
  expect(afterStop).toMatchObject({ status: "pending", attempts: 1, transaction_hash: submittedTx });

  await pool.query(
    `UPDATE effectstream.ckb_evm_relay_outbox SET next_attempt_at = now() WHERE event_id = $1`,
    [sourceEvent.eventId],
  );
  const recovered: RelayExecutor = {
    recover: async () => ({
      transactionHash: submittedTx,
      payloadHash: initialHash,
      receiptStatus: "success",
      receiptBlockNumber: 17n,
    }),
    submit: async () => { submissions++; throw new Error("recovered tx must not be resubmitted"); },
  };
  expect(await processNextRelayIntent(pool, recovered)).toBe(true);
  expect(await outboxState(pool, sourceEvent.eventId)).toMatchObject({
    status: "confirmed", attempts: 2, transaction_hash: submittedTx,
    payload_hash: initialHash, receipt_status: "success", receipt_block_number: "17",
  });
  expect(submissions).toBe(1);

  const expiredLeaseId = relayEventId("e");
  await insertIntent(pool, sourceEvent, expiredLeaseId);
  await pool.query(
    `UPDATE effectstream.ckb_evm_relay_outbox
        SET status = 'submitted', attempts = 1, lease_until = now() - interval '1 second',
            transaction_hash = $2, payload_hash = $3
      WHERE event_id = $1`,
    [expiredLeaseId, blockHash("b"), initialHash],
  );
  let recoveredLease = false;
  const expiredLeaseExecutor: RelayExecutor = {
    recover: async () => {
      recoveredLease = true;
      return {
        transactionHash: blockHash("b"), payloadHash: initialHash,
        receiptStatus: "success", receiptBlockNumber: 18n,
      };
    },
    submit: async () => { throw new Error("expired lease must recover before submission"); },
  };
  expect(await processNextRelayIntent(pool, expiredLeaseExecutor)).toBe(true);
  expect(recoveredLease).toBe(true);
  expect(await outboxState(pool, expiredLeaseId)).toMatchObject({ status: "confirmed", attempts: 2 });

  const retryId = relayEventId("d");
  await insertIntent(pool, sourceEvent, retryId);
  const rpcFailure: RelayExecutor = {
    recover: async () => null,
    submit: async () => { throw new Error("temporary PostgreSQL test RPC failure"); },
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    await pool.query(
      `UPDATE effectstream.ckb_evm_relay_outbox SET next_attempt_at = now() WHERE event_id = $1`,
      [retryId],
    );
    await processNextRelayIntent(pool, rpcFailure);
  }
  expect(await outboxState(pool, retryId)).toMatchObject({
    status: "failed", attempts: 5, last_error: "temporary PostgreSQL test RPC failure",
  });

  const revertedId = relayEventId("c");
  await insertIntent(pool, sourceEvent, revertedId);
  const reverted: RelayExecutor = {
    recover: async () => null,
    submit: async () => ({
      transactionHash: blockHash("c"), payloadHash: initialHash,
      receiptStatus: "reverted", receiptBlockNumber: 19n,
    }),
  };
  await processNextRelayIntent(pool, reverted);
  expect(await outboxState(pool, revertedId)).toMatchObject({
    status: "failed", receipt_status: "reverted", receipt_block_number: "19",
  });
}, 120_000);

async function insertIntent(pool: Pool, event: CkbCellCreatedEventV1, eventId: string): Promise<void> {
  await pool.query(
    `INSERT INTO effectstream.ckb_evm_relay_outbox
       (event_id, destination_chain_id, destination_rpc_url, destination_contract, source_event)
     VALUES ($1, 31337, 'http://127.0.0.1:8545', $2, $3::jsonb)`,
    [eventId, destinationContract, JSON.stringify({ ...event, eventId })],
  );
}

async function outboxState(pool: Pool, eventId: string) {
  const result = await pool.query(
    `SELECT status, attempts, transaction_hash, payload_hash, receipt_status,
            receipt_block_number::text, last_error
       FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1`,
    [eventId],
  );
  return result.rows[0];
}
