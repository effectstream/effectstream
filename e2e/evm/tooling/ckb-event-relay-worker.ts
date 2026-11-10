import type { Pool } from "pg";
import {
  decodeEventLog,
  type Address,
  type Hex,
} from "viem";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { validateCkbEvmRelayConfig } from "../../../packages/node-sdk/runtime/src/ckb-evm-relay.ts";
import { createLocalRelayClients, submitRelay } from "./ckb-event-relay-adapter.ts";
import { normalizeCkbEvent, relayAbi, relayPayloadHash } from "./ckb-event-relay.ts";
import type { CkbCellCreatedEventV1 } from "ckb-multichain-connector";

const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 60;
const POLL_MS = 500;

/** Wait for the EffectStream system migration before the worker queries its outbox. */
export async function waitForRelayOutboxSchema(
  db: Pick<Pool, "query">,
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (!signal?.aborted && Date.now() - startedAt < timeoutMs) {
    try {
      const result = await db.query<{ table_name: string | null }>(
        `SELECT to_regclass('effectstream.ckb_evm_relay_outbox')::text AS table_name`,
      );
      if (result.rows[0]?.table_name) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  const reason = signal?.aborted
    ? "worker startup was cancelled"
    : lastError
      ? "the configured database could not be queried"
      : "the table is still absent";
  throw new Error(
    `CKB relay worker did not find effectstream.ckb_evm_relay_outbox after ${Math.round((Date.now() - startedAt) / 1000)}s (${reason}). Start the EffectStream runtime against this same database and confirm system migration 0.8.2 is registered.`,
  );
}

function localRelayContract(): string {
  return contractAddressesEvmMain().chain31337["CkbEventRelayModule#CkbEventRelay"].toLowerCase();
}

export type RelayIntent = {
  event_id: string;
  destination_chain_id: string | number;
  destination_rpc_url: string;
  destination_contract: string;
  source_event: CkbCellCreatedEventV1;
  attempts: number;
};

export type RelayEvidence = {
  transactionHash: Hex;
  payloadHash: Hex;
  receiptStatus: "success" | "reverted";
  receiptBlockNumber: bigint;
};

export type RelayExecutor = {
  recover: (intent: RelayIntent) => Promise<RelayEvidence | null>;
  submit: (
    intent: RelayIntent,
    onSubmitted: (hash: Hex, payloadHash: Hex) => Promise<void>,
  ) => Promise<RelayEvidence>;
};

/** Claims at most one row. The claim transaction is short; EVM I/O happens after commit. */
export async function processNextRelayIntent(
  db: Pool,
  executor: RelayExecutor = localRelayExecutor,
): Promise<boolean> {
  const injectedExecutor = executor !== localRelayExecutor;
  const client = await db.connect();
  let intent: RelayIntent | undefined;
  try {
    await client.query("BEGIN");
    const selected = await client.query<RelayIntent>(
      `SELECT event_id, destination_chain_id, destination_rpc_url,
              destination_contract, source_event, attempts
         FROM effectstream.ckb_evm_relay_outbox
        WHERE (
                (status IN ('processed', 'pending') AND next_attempt_at <= now())
             OR (status = 'submitting' AND lease_until <= now())
             OR (status = 'submitted' AND lease_until <= now())
        ) AND ($1::boolean OR destination_contract = $2)
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [injectedExecutor, injectedExecutor ? "" : localRelayContract()],
    );
    intent = selected.rows[0];
    if (!intent) {
      await client.query("COMMIT");
      return false;
    }
    const claimed = await client.query(
      `UPDATE effectstream.ckb_evm_relay_outbox
          SET status = 'submitting', attempts = attempts + 1,
              lease_until = now() + ($4 * interval '1 second'), updated_at = now()
        WHERE event_id = $1 AND destination_chain_id = $2 AND destination_contract = $3`,
      [intent.event_id, intent.destination_chain_id, intent.destination_contract, LEASE_SECONDS],
    );
    if (claimed.rowCount !== 1) throw new Error("Relay intent claim was lost.");
    intent = { ...intent, attempts: intent.attempts + 1 };
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
    throw error;
  } finally {
    client.release();
  }

  try {
    const recovered = await executor.recover(intent);
    if (recovered) {
      await persistEvidence(db, intent, recovered);
      return true;
    }
    const evidence = await executor.submit(intent, (hash, payloadHash) => persistSubmitted(db, intent!, hash, payloadHash));
    await persistEvidence(db, intent, evidence);
  } catch (error) {
    const receiptStatus = readReceiptStatus(error);
    const txHash = readTransactionHash(error);
    await persistFailure(db, intent, error, receiptStatus, txHash);
  }
  return true;
}

async function persistSubmitted(db: Pool, intent: RelayIntent, hash: Hex, payloadHash: Hex): Promise<void> {
  await db.query(
    `UPDATE effectstream.ckb_evm_relay_outbox
        SET status = 'submitted', transaction_hash = $4, payload_hash = $5,
            submitted_at = COALESCE(submitted_at, now()), lease_until = now() + ($6 * interval '1 second'),
            updated_at = now(), last_error = NULL
      WHERE event_id = $1 AND destination_chain_id = $2 AND destination_contract = $3`,
    [intent.event_id, intent.destination_chain_id, intent.destination_contract, hash, payloadHash, LEASE_SECONDS],
  );
}

async function persistEvidence(db: Pool, intent: RelayIntent, evidence: RelayEvidence): Promise<void> {
  const success = evidence.receiptStatus === "success";
  await db.query(
    `UPDATE effectstream.ckb_evm_relay_outbox
        SET status = $4, transaction_hash = $5, payload_hash = $6,
            receipt_status = $7, receipt_block_number = $8, confirmed_at = CASE WHEN $4 = 'confirmed' THEN now() ELSE NULL END,
            lease_until = NULL, last_error = CASE WHEN $4 = 'failed' THEN 'EVM transaction receipt reverted' ELSE NULL END,
            updated_at = now()
      WHERE event_id = $1 AND destination_chain_id = $2 AND destination_contract = $3`,
    [intent.event_id, intent.destination_chain_id, intent.destination_contract,
      success ? "confirmed" : "failed", evidence.transactionHash, evidence.payloadHash,
      evidence.receiptStatus, evidence.receiptBlockNumber.toString()],
  );
}

async function persistFailure(
  db: Pool,
  intent: RelayIntent,
  error: unknown,
  receiptStatus: "success" | "reverted" | null,
  transactionHash: string | null,
): Promise<void> {
  const terminal = receiptStatus === "reverted" || intent.attempts >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(2 ** Math.max(0, intent.attempts - 1), 30);
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
  await db.query(
    `UPDATE effectstream.ckb_evm_relay_outbox
        SET status = $4, transaction_hash = COALESCE($5, transaction_hash),
            receipt_status = COALESCE($6, receipt_status), next_attempt_at = now() + ($7 * interval '1 second'),
            lease_until = NULL, last_error = $8, updated_at = now()
      WHERE event_id = $1 AND destination_chain_id = $2 AND destination_contract = $3`,
    [intent.event_id, intent.destination_chain_id, intent.destination_contract,
      terminal ? "failed" : "pending", transactionHash, receiptStatus, delaySeconds, message],
  );
}

function readReceiptStatus(error: unknown): "success" | "reverted" | null {
  if (typeof error !== "object" || error === null || !("receiptStatus" in error)) return null;
  const status = (error as { receiptStatus?: unknown }).receiptStatus;
  return status === "success" || status === "reverted" ? status : null;
}

function readTransactionHash(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("transactionHash" in error)) return null;
  const hash = (error as { transactionHash?: unknown }).transactionHash;
  return typeof hash === "string" ? hash : null;
}

const localRelayExecutor: RelayExecutor = {
  async recover(intent) {
    const clients = await createLocalRelayClients();
    const config = validateCkbEvmRelayConfig({
      rpcUrl: intent.destination_rpc_url,
      chainId: Number(intent.destination_chain_id) as 31337,
      contractAddress: intent.destination_contract as `0x${string}`,
    });
    if (config.rpcUrl !== clients.rpcUrl || config.chainId !== Number(clients.chainId)) {
      throw new Error("Persisted relay destination does not match the fixed local EVM.");
    }
    const contract = config.contractAddress as Address;
    const expectedContract = contractAddressesEvmMain().chain31337["CkbEventRelayModule#CkbEventRelay"];
    if (config.contractAddress.toLowerCase() !== expectedContract.toLowerCase()) {
      throw new Error("Persisted relay contract does not match the local demo deployment.");
    }
    const payload = normalizeCkbEvent(intent.source_event);
    const expected = relayPayloadHash(payload, clients.chainId, contract);
    const stored = await clients.publicClient.readContract({
      address: contract, abi: relayAbi, functionName: "acceptedPayloadHash", args: [payload.eventId],
    });
    if (stored === `0x${"0".repeat(64)}`) return null;
    if (stored !== expected) throw new Error("Destination already accepted this event ID with a different payload hash.");

    const acceptanceEvent = relayAbi.find((item) => item.type === "event" && item.name === "SourceEventAccepted");
    if (!acceptanceEvent) throw new Error("Relay ABI is missing SourceEventAccepted.");
    const logs = await clients.publicClient.getLogs({
      address: contract,
      event: acceptanceEvent as any,
      args: { eventId: payload.eventId },
      fromBlock: 0n,
      toBlock: "latest",
    });
    for (const log of logs) {
      const decoded = decodeEventLog({ abi: relayAbi, ...log });
      if (decoded.eventName !== "SourceEventAccepted" || decoded.args.payloadHash !== expected) continue;
      const receipt = await clients.publicClient.getTransactionReceipt({ hash: log.transactionHash });
      return {
        transactionHash: log.transactionHash,
        payloadHash: expected,
        receiptStatus: receipt.status === "success" ? "success" : "reverted",
        receiptBlockNumber: receipt.blockNumber,
      };
    }
    throw new Error("Relay storage reports acceptance but no matching event receipt was found.");
  },

  async submit(intent, onSubmitted) {
    const expectedContract = contractAddressesEvmMain().chain31337["CkbEventRelayModule#CkbEventRelay"];
    if (intent.destination_contract.toLowerCase() !== expectedContract.toLowerCase()) {
      throw new Error("Persisted relay contract does not match the local demo deployment.");
    }
    const clients = await createLocalRelayClients();
    const config = validateCkbEvmRelayConfig({
      rpcUrl: intent.destination_rpc_url,
      chainId: Number(intent.destination_chain_id) as 31337,
      contractAddress: intent.destination_contract as `0x${string}`,
    });
    if (config.rpcUrl !== clients.rpcUrl || config.chainId !== Number(clients.chainId)) {
      throw new Error("Persisted relay destination does not match the fixed local EVM.");
    }
    const contract = config.contractAddress as Address;
    const payload = normalizeCkbEvent(intent.source_event);
    const expected = relayPayloadHash(payload, clients.chainId, contract);
    const result = await submitRelay(clients, contract, payload, onSubmitted);
    if (result.alreadyAccepted) {
      const recovered = await localRelayExecutor.recover(intent);
      if (recovered) return recovered;
      throw new Error("Destination accepted the source event but receipt evidence is not available yet.");
    }
    return {
      transactionHash: result.transactionHash,
      payloadHash: expected,
      receiptStatus: result.receipt.status === "success" ? "success" : "reverted",
      receiptBlockNumber: result.receipt.blockNumber,
    };
  },
};

/** Long-running local demo worker. It has no remote RPC or key configuration. */
export async function runCkbRelayWorker(db: Pool, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const processed = await processNextRelayIntent(db);
      if (!processed) await sleep(POLL_MS, signal);
    } catch (error) {
      console.error("CKB relay worker poll failed:", error instanceof Error ? error.message : String(error));
      await sleep(POLL_MS, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
