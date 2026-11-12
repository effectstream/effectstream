import { assert } from "@e2e/engine";
import type { Pool } from "pg";
import { getConnection } from "@effectstream/db";
import { PrimitiveRegistry } from "@effectstream/sm";
import { processFinalizedBlock } from "../../../packages/node-sdk/runtime/src/process-blocks.ts";
import type { ChainBlock } from "../../../packages/node-sdk/sync/src/sync-protocols/common/root.ts";
import { CkbRelayPrimitive, CKB_RELAY_PRIMITIVE_NAME } from "../ckb-relay-primitive.ts";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import { run } from "effection";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import type { CkbCellCreatedEventV1, CkbFetch } from "ckb-multichain-connector";
import { CkbFetcher } from "../../../packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.ts";
import type { ConfigType, Output } from "../../../packages/node-sdk/sync/src/sync-protocols/ckb/types.ts";
import type { RootPage } from "../../../packages/node-sdk/sync/src/sync-protocols/ckb/types.ts";
import { assertLocalRelayDestination, createLocalRelayClients } from "./ckb-event-relay-adapter.ts";
import { normalizeCkbEvent, relayAbi, relayPayloadHash } from "./ckb-event-relay.ts";
import { processNextRelayIntent } from "./ckb-event-relay-worker.ts";

const blockHash = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const genesisHash = blockHash("0");
const txHash = blockHash("b");
const script = { code_hash: blockHash("a"), hash_type: "type", args: "0x1234" };
const network = {
  name: "ckb-relay-fixture", type: ConfigNetworkType.CKB, rpcUrl: "http://127.0.0.1:8114",
  network: "devnet", genesisBlockHash: genesisHash,
};
const syncProtocol = {
  name: "ckb-relay-fixture", type: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
  startBlockHeight: 1, stopBlockHeight: 1, pollingInterval: 1000,
  requestTimeoutMs: 1000, confirmationDepth: 0, reorgWindow: 4,
  targetScript: { role: "lock", script: { codeHash: blockHash("a"), hashType: "type", args: "0x1234" } },
  delayMs: 0, stepSize: 1,
};
const config = { network, syncProtocol, primitives: [{ id: CKB_RELAY_PRIMITIVE_NAME }] } as unknown as ConfigType;

function ckbFixtureFetch(): CkbFetch {
  const genesisHeader = { number: "0x0", hash: genesisHash, timestamp: "0x0" };
  const eventHeader = { number: "0x1", hash: blockHash("1"), timestamp: "0x64" };
  const genesisBlock = { header: genesisHeader, transactions: [] };
  const eventBlock = {
    header: eventHeader,
    transactions: [{ hash: txHash, inner: {
      outputs: [
        { capacity: "0x2540be400", lock: script, type: null },
        { capacity: "0x1", lock: script, type: null },
      ],
      outputs_data: ["0x", "0x1234"],
    } }],
  };
  return async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: string[] };
    let result: unknown;
    const requestedHeight = request.params[0] === undefined ? 1 : Number(BigInt(request.params[0]));
    switch (request.method) {
      case "get_block_by_number": result = requestedHeight === 0 ? genesisBlock : eventBlock; break;
      case "get_header_by_number": result = requestedHeight === 0 ? genesisHeader : eventHeader; break;
      case "get_tip_header": result = eventHeader; break;
      default: throw new Error(`Unexpected fixture RPC method ${request.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { status: 200 });
  };
}

const rootConversion = { toRootPage: (output: Output) => Number(output.raw.timestamp) as RootPage } as any;

export async function ckbToEvmRelayTest(_suiteDb?: unknown) {
  const addresses = contractAddressesEvmMain();
  const contractAddress = addresses.chain31337["CkbEventRelayModule#CkbEventRelay"] as Address;
  const clients = await createLocalRelayClients();
  const pool = getConnection();
  const live = process.env["CKB_RELAY_DEMO"] === "true";
  let sourceEvent: CkbCellCreatedEventV1 | undefined;
  try {
    if (live) {
      const expectedTransaction = process.env["CKB_RELAY_EXPECTED_TX"]?.toLowerCase();
      if (!expectedTransaction || !/^0x[0-9a-f]{64}$/.test(expectedTransaction)) {
        throw new Error("Live CKB relay demo requires CKB_RELAY_EXPECTED_TX.");
      }
      sourceEvent = await waitForProcessedSourceEvent(pool, expectedTransaction);
    } else {
      sourceEvent = await processFixtureThroughRuntime(pool);
    }
    const payload = normalizeCkbEvent(sourceEvent);
    const expectedHash = relayPayloadHash(payload, clients.chainId, contractAddress);
    const row = await waitForOutboxConfirmation(pool, sourceEvent.eventId);
    const publicClient = createPublicClient({ chain: hardhat, transport: http("http://127.0.0.1:8545") });
    const storedHash = await publicClient.readContract({
      address: contractAddress, abi: relayAbi, functionName: "acceptedPayloadHash", args: [payload.eventId],
    });
    const receipt = row.transaction_hash
      ? await publicClient.getTransactionReceipt({ hash: row.transaction_hash as Hex })
      : undefined;
    console.log(JSON.stringify({
      evidence: live ? "live-offckb" : "fixture-through-effectstream-runtime",
      sourceEventId: sourceEvent.eventId,
      sourceBlockHeight: sourceEvent.source.blockHeight,
      sourceBlockHash: sourceEvent.source.blockHash,
      sourceTransactionHash: sourceEvent.source.transactionHash,
      outboxRecordKey: [sourceEvent.eventId, "31337", contractAddress].join(":"),
      outboxStatus: row.status,
      payloadHash: row.payload_hash,
      destinationContract: contractAddress,
      destinationTransactionHash: row.transaction_hash,
      receiptStatus: row.receipt_status,
      receiptBlockNumber: row.receipt_block_number,
      storedPayloadHash: storedHash,
    }));

    await assert("EffectStream processed CKB event is durably queued and confirmed on local EVM", async () =>
      (() => {
        const checks = {
          status: row.status === "confirmed",
          receiptStatus: row.receipt_status === "success",
          payloadHash: row.payload_hash?.toLowerCase() === expectedHash.toLowerCase(),
          storedHash: storedHash.toLowerCase() === expectedHash.toLowerCase(),
          receipt: receipt?.status === "success",
        };
        console.log("CKB relay evidence checks:", checks);
        return Object.values(checks).every(Boolean);
      })());

    await assert("relay worker has no duplicate pending execution after confirmation", async () => {
      await processNextRelayIntent(pool);
      const matching = await pool.query(
        `SELECT count(*)::int AS count FROM effectstream.ckb_evm_relay_outbox
          WHERE event_id = $1 AND destination_chain_id = 31337 AND destination_contract = $2`,
        [sourceEvent.eventId, contractAddress.toLowerCase()],
      );
      return matching.rows[0]?.count === 1;
    });

    if (!live) {
      await assert("reprocessing the same source event does not create a second logical relay", async () => {
        await processFixtureThroughRuntime(pool, { rootHeight: 1_000_000_001 });
        const matching = await pool.query(
          `SELECT count(*)::int AS count FROM effectstream.ckb_evm_relay_outbox
            WHERE event_id = $1 AND destination_chain_id = 31337 AND destination_contract = $2`,
          [sourceEvent.eventId, contractAddress.toLowerCase()],
        );
        return matching.rows[0]?.count === 1;
      });

      await assert("database rollback removes both processed CKB event and outbox intent", async () => {
        const uncommittedEventId = `ckb-cell-created:${"f".repeat(64)}`;
        try {
          await processFixtureThroughRuntime(pool, {
            rootHeight: 1_000_000_002,
            eventId: uncommittedEventId,
            invalidResumePage: true,
          });
          return false;
        } catch {
          const [intent, accounting, root] = await Promise.all([
            pool.query(`SELECT count(*)::int AS count FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1`, [uncommittedEventId]),
            pool.query(`SELECT count(*)::int AS count FROM effectstream.primitive_accounting WHERE effectstream_block_height = $1 AND payload->>'eventId' = $2`, [1_000_000_002, uncommittedEventId]),
            pool.query(`SELECT count(*)::int AS count FROM effectstream.effectstream_blocks WHERE block_height = $1`, [1_000_000_002]),
          ]);
          return intent.rows[0]?.count === 0 && accounting.rows[0]?.count === 0 && root.rows[0]?.count === 0;
        }
      });
    }

    // Keep fabricated recovery/retry rows out of the live demonstration
    // database so its dashboard feed remains entirely source-chain backed.
    if (!live) {
    await assert("worker restart recovers a persisted submission without submitting twice", async () => {
      const eventId = `ckb-cell-created:${"e".repeat(64)}`;
      const event = { ...sourceEvent, eventId };
      const testContract = "0x0000000000000000000000000000000000000001";
      await insertMockIntent(pool, event, testContract);
      const payloadHash = relayPayloadHash(normalizeCkbEvent(event), 31337n, testContract as Address);
      const transactionHash = blockHash("a");
      let submissions = 0;
      const interruptedExecutor = {
        recover: async () => null,
        submit: async (_intent: any, onSubmitted: (hash: Hex, payloadHash: Hex) => Promise<void>) => {
          submissions++;
          await onSubmitted(transactionHash, payloadHash);
          throw new Error("simulated interruption after submitted hash persistence");
        },
      };
      await processNextRelayIntent(pool, interruptedExecutor);
      const afterInterruption = await pool.query<{ status: string; transaction_hash: string | null; attempts: number }>(
        `SELECT status, transaction_hash, attempts FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1`,
        [eventId],
      );
      await pool.query(`UPDATE effectstream.ckb_evm_relay_outbox SET next_attempt_at = now() WHERE event_id = $1`, [eventId]);
      const restartedExecutor = {
        recover: async () => ({
          transactionHash, payloadHash, receiptStatus: "success" as const, receiptBlockNumber: 7n,
        }),
        submit: async () => { submissions++; throw new Error("recovery must not submit again"); },
      };
      await processNextRelayIntent(pool, restartedExecutor);
      const afterRestart = await pool.query<{ status: string; transaction_hash: string | null; attempts: number; receipt_status: string | null }>(
        `SELECT status, transaction_hash, attempts, receipt_status FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1`,
        [eventId],
      );
      const row = afterRestart.rows[0];
      return afterInterruption.rows[0]?.status === "pending" &&
        afterInterruption.rows[0]?.transaction_hash === transactionHash &&
        row?.status === "confirmed" && row.transaction_hash === transactionHash &&
        row.receipt_status === "success" && row.attempts === 2 && submissions === 1;
    });

    await assert("worker bounds transient retries and records exhausted work as failed", async () => {
      const eventId = `ckb-cell-created:${"d".repeat(64)}`;
      const event = { ...sourceEvent, eventId };
      const testContract = "0x0000000000000000000000000000000000000002";
      await insertMockIntent(pool, event, testContract);
      const failingExecutor = { recover: async () => null, submit: async () => { throw new Error("temporary RPC outage"); } };
      for (let attempt = 0; attempt < 5; attempt++) {
        await pool.query(`UPDATE effectstream.ckb_evm_relay_outbox SET next_attempt_at = now() WHERE event_id = $1`, [eventId]);
        await processNextRelayIntent(pool, failingExecutor);
      }
      const result = await pool.query<{ status: string; attempts: number; last_error: string | null }>(
        `SELECT status, attempts, last_error FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1`,
        [eventId],
      );
      return result.rows[0]?.status === "failed" && result.rows[0].attempts === 5 &&
        result.rows[0].last_error === "temporary RPC outage";
    });

    await assert("reverted EVM receipt is persisted as failed, never confirmed", async () => {
      const eventId = `ckb-cell-created:${"c".repeat(64)}`;
      const event = { ...sourceEvent, eventId };
      const testContract = "0x0000000000000000000000000000000000000003";
      await insertMockIntent(pool, event, testContract);
      const payloadHash = relayPayloadHash(normalizeCkbEvent(event), 31337n, testContract as Address);
      const executor = {
        recover: async () => null,
        submit: async () => ({
          transactionHash: blockHash("b"), payloadHash,
          receiptStatus: "reverted" as const, receiptBlockNumber: 8n,
        }),
      };
      await processNextRelayIntent(pool, executor);
      const result = await pool.query<{ status: string; receipt_status: string | null }>(
        `SELECT status, receipt_status FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1`,
        [eventId],
      );
      return result.rows[0]?.status === "failed" && result.rows[0].receipt_status === "reverted";
    });
    }
  } finally {
    try {
      // Keep this fixture integration from changing the global accounting
      // count used by the existing batcher signature regression test. These
      // rows were created only by the synthetic roots above; clean them after
      // the relay assertions have captured their durable and on-chain evidence.
      if (!live && sourceEvent) {
        const fixtureEventIds = [
          sourceEvent.eventId,
          `ckb-cell-created:${"e".repeat(64)}`,
          `ckb-cell-created:${"d".repeat(64)}`,
          `ckb-cell-created:${"c".repeat(64)}`,
        ];
        try {
          await pool.query("BEGIN");
          await pool.query(
            `DELETE FROM effectstream.primitive_accounting
              WHERE primitive_name = $1
                AND effectstream_block_height = ANY($2::bigint[])
                AND payload->>'eventId' = ANY($3::text[])`,
            [CKB_RELAY_PRIMITIVE_NAME, [1_000_000_000, 1_000_000_001], fixtureEventIds],
          );
          await pool.query(
            `DELETE FROM effectstream.effectstream_blocks
              WHERE block_height = ANY($1::bigint[])`,
            [[1_000_000_000, 1_000_000_001]],
          );
          await pool.query(
            `DELETE FROM effectstream.sync_protocol_pagination WHERE protocol_name = $1`,
            [syncProtocol.name],
          );
          await pool.query(
            `DELETE FROM effectstream.ckb_evm_relay_outbox WHERE event_id = ANY($1::text[])`,
            [fixtureEventIds],
          );
          await pool.query("COMMIT");
        } catch (cleanupError) {
          try { await pool.query("ROLLBACK"); } catch { /* keep the cleanup failure */ }
          throw cleanupError;
        }
      }
    } finally {
      await pool.end();
    }
  }

  const payload = normalizeCkbEvent(sourceEvent!);
  const publicClient = createPublicClient({ chain: hardhat, transport: http("http://127.0.0.1:8545") });
  await assert("destination contract rejects a non-authorized signer", async () => {
    try {
      await publicClient.simulateContract({
        account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
        address: contractAddress, abi: relayAbi, functionName: "relay",
        args: [{ ...payload, eventId: blockHash("c") }],
      });
      return false;
    } catch { return true; }
  });

  await assert("destination contract rejects duplicate relay execution", async () => {
    try {
      await publicClient.simulateContract({
        account: clients.accountAddress, address: contractAddress, abi: relayAbi,
        functionName: "relay", args: [payload],
      });
      return false;
    } catch { return true; }
  });

  await assert("destination contract rejects malformed source identifiers", async () => {
    try {
      await publicClient.simulateContract({
        account: clients.accountAddress, address: contractAddress, abi: relayAbi,
        functionName: "relay", args: [{ ...payload, eventId: blockHash("0") }],
      });
      return false;
    } catch { return true; }
  });

  await assert("invalid payload submission leaves destination state unchanged", async () => {
    const failedEventId = blockHash("d");
    try {
      await clients.walletClient.writeContract({
        address: contractAddress, abi: relayAbi, functionName: "relay",
        args: [{ ...payload, eventId: failedEventId, sourceNetwork: blockHash("0") }],
      });
      return false;
    } catch {
      const unchanged = await publicClient.readContract({
        address: contractAddress, abi: relayAbi, functionName: "acceptedPayloadHash", args: [failedEventId],
      });
      return unchanged === `0x${"0".repeat(64)}`;
    }
  });

  await assert("local Hardhat destination accepts loopback RPC and chain ID 31337", async () => {
    try { assertLocalRelayDestination("http://localhost:8545", 31337n); return true; }
    catch { return false; }
  });

  await assert("relay destination rejects non-loopback RPC before submission", async () => {
    try {
      assertLocalRelayDestination("https://rpc.example.com", 31337n);
      return false;
    } catch { return true; }
  });

  await assert("relay destination rejects an incorrect chain ID before submission", async () => {
    try { assertLocalRelayDestination("http://127.0.0.1:8545", 1n); return false; }
    catch { return true; }
  });

  await assert("environment overrides cannot redirect automated E2E clients", async () => {
    const previous = {
      rpc: process.env["EFFECTSTREAM_EVM_RPC_URL"],
      chain: process.env["EFFECTSTREAM_EVM_CHAIN_ID"],
      key: process.env["EFFECTSTREAM_EVM_PRIVATE_KEY"],
    };
    process.env["EFFECTSTREAM_EVM_RPC_URL"] = "https://rpc.example.com";
    process.env["EFFECTSTREAM_EVM_CHAIN_ID"] = "1";
    process.env["EFFECTSTREAM_EVM_PRIVATE_KEY"] = "0x" + "11".repeat(32);
    try {
      const fixed = await createLocalRelayClients();
      return fixed.rpcUrl === "http://127.0.0.1:8545" && fixed.chainId === 31337n &&
        fixed.accountAddress.toLowerCase() === "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
    } finally {
      if (previous.rpc === undefined) delete process.env["EFFECTSTREAM_EVM_RPC_URL"]; else process.env["EFFECTSTREAM_EVM_RPC_URL"] = previous.rpc;
      if (previous.chain === undefined) delete process.env["EFFECTSTREAM_EVM_CHAIN_ID"]; else process.env["EFFECTSTREAM_EVM_CHAIN_ID"] = previous.chain;
      if (previous.key === undefined) delete process.env["EFFECTSTREAM_EVM_PRIVATE_KEY"]; else process.env["EFFECTSTREAM_EVM_PRIVATE_KEY"] = previous.key;
    }
  });

}

type RelayOutboxRow = {
  status: string;
  transaction_hash: string | null;
  payload_hash: string | null;
  receipt_status: string | null;
  receipt_block_number: string | null;
};

export async function processFixtureThroughRuntime(
  pool: Pool,
  options: {
    rootHeight?: number;
    eventId?: string;
    invalidResumePage?: boolean;
    contractAddress?: `0x${string}`;
  } = {},
): Promise<CkbCellCreatedEventV1> {
  const fetcher = new CkbFetcher(config, ckbFixtureFetch());
  const fetched = await run(() => fetcher.readData({
    from: { height: 1 }, to: { height: 1 }, isPresync: false,
  }, rootConversion));
  const nativeOutput = fetched.output[0]?.output;
  const primitive = nativeOutput?.primitives[0];
  const event = primitive?.output.payload as CkbCellCreatedEventV1 | undefined;
  if (!nativeOutput || !primitive || !event) throw new Error("CKB native fetcher fixture produced no event.");
  if (!PrimitiveRegistry.primitives[CKB_RELAY_PRIMITIVE_NAME]) {
    new CkbRelayPrimitive({ instanceName: CKB_RELAY_PRIMITIVE_NAME, startBlockHeight: 0 });
  }
  const rootHeight = options.rootHeight ?? 1_000_000_000;
  const rootPrimitive = {
    ...primitive,
    source: syncProtocol.name,
    ...(options.eventId ? { output: { ...primitive.output, payload: { ...event, eventId: options.eventId } } } : {}),
  };
  const resumePage = options.invalidResumePage
    ? { ...fetched.lastPage, ownBlockNumber: null }
    : fetched.lastPage;
  const chainBlock = {
    blockNumber: rootHeight,
    timestamp: Number(nativeOutput.raw.timestamp),
    blockInfo: nativeOutput.blockHashes.map((hash) => ({
      protocol_name: syncProtocol.name, block_number: nativeOutput.raw.height, blockHash: hash,
    })),
    resumePages: [{ protocol_name: syncProtocol.name, lastPage: resumePage }],
    primitives: [rootPrimitive],
  } as unknown as ChainBlock;
  const contractAddress = options.contractAddress ??
    contractAddressesEvmMain().chain31337["CkbEventRelayModule#CkbEventRelay"];
  const client = await pool.connect();
  try {
    await run(() => processFinalizedBlock(chainBlock, {
      appName: "ckb-relay-e2e", appVersion: "1.0.0", syncInfo: [],
      ckbEvmRelay: { rpcUrl: "http://127.0.0.1:8545", chainId: 31337, contractAddress: contractAddress as `0x${string}` },
    }, client as any, null));
  } finally {
    client.release();
  }
  return event;
}

async function insertMockIntent(
  pool: ReturnType<typeof getConnection>,
  event: CkbCellCreatedEventV1,
  contractAddress: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO effectstream.ckb_evm_relay_outbox
       (event_id, destination_chain_id, destination_rpc_url, destination_contract, source_event)
     VALUES ($1, 31337, 'http://127.0.0.1:8545', $2, $3::jsonb)`,
    [event.eventId, contractAddress, JSON.stringify(event)],
  );
}

async function waitForProcessedSourceEvent(pool: ReturnType<typeof getConnection>, txHash: string): Promise<CkbCellCreatedEventV1> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const result = await pool.query<{ payload: CkbCellCreatedEventV1 }>(
      `SELECT payload FROM effectstream.primitive_accounting
        WHERE primitive_name = $1 AND payload->'source'->>'transactionHash' = $2
        ORDER BY id DESC LIMIT 1`,
      [CKB_RELAY_PRIMITIVE_NAME, txHash],
    );
    if (result.rows[0]) return result.rows[0].payload;
    await Bun.sleep(500);
  }
  throw new Error(`EffectStream did not process expected CKB transaction ${txHash}.`);
}

async function waitForOutboxConfirmation(pool: ReturnType<typeof getConnection>, eventId: string): Promise<RelayOutboxRow> {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const result = await pool.query<RelayOutboxRow>(
      `SELECT status, transaction_hash, payload_hash, receipt_status, receipt_block_number::text
         FROM effectstream.ckb_evm_relay_outbox
        WHERE event_id = $1 AND destination_chain_id = 31337
        ORDER BY created_at LIMIT 1`,
      [eventId],
    );
    const row = result.rows[0];
    if (row?.status === "confirmed" || row?.status === "failed") {
      if (row.status === "failed") throw new Error(`Relay worker failed for ${eventId}: ${row.receipt_status ?? "see last_error"}`);
      return row;
    }
    await Bun.sleep(250);
  }
  throw new Error(`Relay outbox event ${eventId} did not reach confirmation in time.`);
}
