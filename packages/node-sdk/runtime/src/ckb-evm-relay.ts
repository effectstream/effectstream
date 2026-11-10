import type { Pool } from "pg";
import type { CkbEvmRelayConfig } from "./types.ts";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validateCkbEvmRelayConfig(input: CkbEvmRelayConfig): CkbEvmRelayConfig {
  if (input.chainId !== 31337) {
    throw new Error("CKB EVM relay only supports local chain ID 31337.");
  }
  let url: URL;
  try {
    url = new URL(input.rpcUrl);
  } catch {
    throw new Error("CKB EVM relay RPC URL must be a valid loopback URL.");
  }
  if (
    url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
    url.username || url.password || url.search || url.hash
  ) {
    throw new Error("CKB EVM relay requires an unauthenticated loopback HTTP RPC URL.");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.contractAddress)) {
    throw new Error("CKB EVM relay contract address must be a 20-byte hex address.");
  }
  return {
    ...input,
    rpcUrl: url.pathname === "/" ? url.origin : url.toString(),
    contractAddress: input.contractAddress.toLowerCase() as `0x${string}`,
  };
}

export async function persistCkbRelayIntent(
  dbConn: Pool,
  config: CkbEvmRelayConfig,
  rawEvent: unknown,
): Promise<void> {
  const destination = validateCkbEvmRelayConfig(config);
  if (!isRecord(rawEvent) || typeof rawEvent.eventId !== "string" ||
    !/^ckb-cell-created:[0-9a-f]{64}$/.test(rawEvent.eventId)) {
    throw new Error("Processed CKB event has an invalid deterministic event ID.");
  }
  await dbConn.query(
    `INSERT INTO effectstream.ckb_evm_relay_outbox
       (event_id, destination_chain_id, destination_rpc_url, destination_contract, source_event)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (event_id, destination_chain_id, destination_contract) DO NOTHING`,
    [rawEvent.eventId, destination.chainId, destination.rpcUrl, destination.contractAddress, JSON.stringify(rawEvent)],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
