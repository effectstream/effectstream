// Midnight endpoints and the network tag, per bridge mode.
//
//   local     the orchestrator's 2.x devnet (`undeployed`): node, indexer, the
//             DUST prover (engine rc.5, :6300) and the contract prover
//             (9.0.0-rc.8, :6301)
//   stagenet  live mode: Midnight stagenet (shielded.tools endpoints) by
//             default, with both provers running locally (start.live.ts).
//             MIDNIGHT_NETWORK_ID selects another network (for example a
//             separately started `undeployed` 2.x devnet standing in for
//             stagenet, PR-2 T7); its endpoints must then be set explicitly.
//
// Two provers, never one (00050 G0/E2): `mintFromSolana` verifies an Ed25519
// signature in a ZKIR-v3 circuit that only 9.0.0-rc.8 proves, while DUST spends
// on stagenet need a `dust/9` prover (rc.5/rc.6; rc.8 is `dust/10`).
//
// Environment overrides (same names as @effectstream/midnight-contracts):
//   MIDNIGHT_NETWORK_ID                 (live mode only; default stagenet)
//   MIDNIGHT_INDEXER_HTTP, MIDNIGHT_INDEXER_WS, MIDNIGHT_NODE_HTTP,
//   MIDNIGHT_PROOF_SERVER_URL           (DUST prover)
//   MIDNIGHT_CONTRACT_PROOF_SERVER_URL  (contract prover; when set, the
//                                        orchestrator does not start one: Q10 A)
import { createHash } from "node:crypto";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";

export type BridgeMidnightMode = "local" | "stagenet";

export type BridgeMidnightUrls = {
  id: NetworkId.NetworkId;
  indexer: string;
  indexerWS: string;
  node: string;
  /** Wallet prover: DUST fees and zswap balancing (dust/9). */
  proofServer: string;
  /** Contract-circuit prover (9.0.0-rc.8 for the ed25519 mint). */
  contractProofServer: string;
};

/** Default ports of the two local provers. */
export const DUST_PROOF_SERVER_PORT = 6300;
export const CONTRACT_PROOF_SERVER_PORT = Number(process.env.BRIDGE_CONTRACT_PROOF_SERVER_PORT ?? "6301");

/** Proof server image/version for the contract prover (Q9 A: the official image until binaries ship it). */
export const CONTRACT_PROOF_SERVER_VERSION = "9.0.0-rc.8";

const env = (key: string): string | undefined => {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
};

const DEFAULTS: Record<BridgeMidnightMode, Omit<BridgeMidnightUrls, "proofServer" | "contractProofServer">> = {
  local: {
    id: "undeployed" as NetworkId.NetworkId,
    indexer: "http://127.0.0.1:8088/api/v4/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
    node: "http://127.0.0.1:9944",
  },
  stagenet: {
    id: "stagenet" as NetworkId.NetworkId,
    indexer: "https://indexer.stagenet.shielded.tools/api/v4/graphql",
    indexerWS: "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
    node: "wss://rpc.stagenet.shielded.tools",
  },
};

export function parseMidnightMode(value: string | undefined): BridgeMidnightMode {
  const v = (value ?? "local").trim();
  if (v === "local" || v === "stagenet") return v;
  throw new Error(`unknown Midnight mode "${v}" (expected "local" or "stagenet")`);
}

/**
 * The Midnight network id of live mode: MIDNIGHT_NETWORK_ID, default
 * "stagenet". Refuses mainnet (this bridge is a proof of concept) and anything
 * that is not a plain lowercase id (it becomes a bech32m address prefix).
 */
export function liveMidnightNetworkId(e: Record<string, string | undefined> = process.env): NetworkId.NetworkId {
  const v = e.MIDNIGHT_NETWORK_ID?.trim();
  if (!v) return "stagenet" as NetworkId.NetworkId;
  if (!/^[a-z][a-z0-9-]*$/.test(v)) throw new Error(`MIDNIGHT_NETWORK_ID "${v}" is not a Midnight network id`);
  if (v === "mainnet") throw new Error("refusing MIDNIGHT_NETWORK_ID=mainnet: this bridge is a proof of concept");
  return v as NetworkId.NetworkId;
}

/** Endpoints for `mode`, with the environment overrides applied. */
export function midnightUrls(mode: BridgeMidnightMode): BridgeMidnightUrls {
  const d = DEFAULTS[mode];
  const id = mode === "stagenet" ? liveMidnightNetworkId() : d.id;
  if (id !== d.id) {
    // Another live network: never fall back to stagenet's endpoints.
    const missing = ["MIDNIGHT_INDEXER_HTTP", "MIDNIGHT_INDEXER_WS", "MIDNIGHT_NODE_HTTP"].filter((k) => !env(k));
    if (missing.length > 0) {
      throw new Error(`MIDNIGHT_NETWORK_ID=${id} needs ${missing.join(", ")} (the stagenet endpoints are only the default for stagenet)`);
    }
  }
  return {
    id,
    indexer: env("MIDNIGHT_INDEXER_HTTP") ?? d.indexer,
    indexerWS: env("MIDNIGHT_INDEXER_WS") ?? d.indexerWS,
    node: env("MIDNIGHT_NODE_HTTP") ?? d.node,
    proofServer: env("MIDNIGHT_PROOF_SERVER_URL") ?? `http://127.0.0.1:${DUST_PROOF_SERVER_PORT}`,
    contractProofServer:
      env("MIDNIGHT_CONTRACT_PROOF_SERVER_URL") ?? `http://127.0.0.1:${CONTRACT_PROOF_SERVER_PORT}`,
  };
}

/**
 * The `networkTag` the contract seals at deploy and binds into every mint
 * digest: sha256("midnight:" + networkId), as P0 S1 deployed it. A signature
 * made for one network can therefore never mint on another. (The value only
 * has to be stable per deployment: the relayer reads it back from the
 * deployment file / ledger before signing.)
 */
export function networkTagFor(networkId: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`midnight:${networkId}`).digest());
}

/** Whether a URL points at this machine (local devnet / local prover). */
export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
    return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
  } catch {
    return false;
  }
}
