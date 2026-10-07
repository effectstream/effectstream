// Sync configuration for both modes (sub-plan T3.1):
//   NTP main
//   + SOLANA_RPC_PARALLEL  → SOLANA:ProgramLog on the bridge program, read in
//                            program mode (only the program's transactions,
//                            the live default) or block mode (every slot, the
//                            local default): BRIDGE_SOLANA_SYNC_MODE (AA 00064)
//   + MIDNIGHT_PARALLEL    → Midnight:Generic on the bridge contract, decoded
//                            with midnightLedgerFromTxStateHex(ledger, the
//                            contract's OWN 0.20 ContractState) (P0 S2)
// Start heights come from the deployment file (the Solana slot recorded just
// before Initialize, the Midnight indexer height recorded just before deploy),
// so a wiped database re-syncs every transfer from scratch (US4).
//
//   local  deployments/local.json, the local validator and devnet
//   live   deployments/$BRIDGE_DEPLOYMENT (default devnet-stagenet.json),
//          Solana via SOLANA_DEVNET_RPC_URL_FILE / SOLANA_DEVNET_RPC_URL (default devnet), Midnight
//          stagenet, or the network MIDNIGHT_NETWORK_ID names (network.ts)
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeMidnightGeneric, PrimitiveTypeSolanaProgramLog } from "@effectstream/sm/builtin";
import { midnightLedgerFromTxStateHex } from "@effectstream/midnight-contracts/ledger-from-tx-state";
import { getConnection } from "@effectstream/db";
import {
  readDeployment,
  deploymentPath,
  type SolanaDeployment,
} from "@solana-midnight-bridge/contracts-solana/deployments";
import { DEV_SOLANA_RPC_URL, LOCAL_DEPLOYMENT } from "@solana-midnight-bridge/contracts-solana/dev-config";
import { liveSolanaRpcUrl, redactRpcUrl } from "@solana-midnight-bridge/contracts-solana/keys";
import { BridgeContractState, bridgeLedger } from "@solana-midnight-bridge/contracts-midnight/contract";
import { midnightUrls, type BridgeMidnightUrls } from "@solana-midnight-bridge/contracts-midnight/network";
import type { MidnightDeployment } from "@solana-midnight-bridge/contracts-midnight/deploy";
import { MIDNIGHT_STATE_PREFIX, SOLANA_LOG_PREFIX } from "./grammar.ts";

export type BridgeNodeMode = "local" | "live";

export const MAIN_SYNC_PROTOCOL = "mainNtp";
export const SOLANA_SYNC_PROTOCOL = "parallelSolana";
export const MIDNIGHT_SYNC_PROTOCOL = "parallelMidnight";

export function parseNodeMode(v: string | undefined): BridgeNodeMode {
  const m = (v ?? "local").trim();
  if (m === "local" || m === "live") return m;
  throw new Error(`unknown node mode "${m}" (expected local or live)`);
}

/**
 * How the node reads Solana (AA 00064; the engine's `SOLANA_RPC_PARALLEL` `mode`):
 * - `program`: only the bridge program's own transactions. One poll every
 *   `BRIDGE_SOLANA_POLL_MS` (default 6 s) is `getSlot(finalized)` +
 *   `getBlockTime` + `getSignaturesForAddress(program)`, then one
 *   `getTransaction` per new transaction: ~43k RPC calls a day for an idle
 *   node. The default in live mode.
 * - `block`: every slot with `getBlock` (~450k calls a day on devnet). The
 *   default in local mode, so the dev flow does not change.
 */
export type BridgeSolanaSyncMode = "program" | "block";

/** Program mode's poll interval: 6 s by default, never under 1 s (S2). */
export const DEFAULT_SOLANA_POLL_MS = 6000;
export const MIN_SOLANA_POLL_MS = 1000;

/** The settings only block mode reads; program mode ignores them and warns once when one is set (S3). */
export const BLOCK_MODE_ONLY_SETTINGS = [
  "BRIDGE_SOLANA_POLLING_MS",
  "BRIDGE_SOLANA_STEP_SIZE",
  "BRIDGE_SOLANA_CONFIRMATION_DEPTH",
  "BRIDGE_SOLANA_GETBLOCK_CONCURRENCY",
  "BRIDGE_SOLANA_GETBLOCK_MIN_INTERVAL_MS",
] as const;

/** `BRIDGE_SOLANA_SYNC_MODE`: `program` or `block`; unset → `program` live, `block` local (S1). */
export function parseSolanaSyncMode(v: string | undefined, nodeMode: BridgeNodeMode): BridgeSolanaSyncMode {
  if (v === undefined || v.trim() === "") return nodeMode === "live" ? "program" : "block";
  const m = v.trim();
  if (m === "program" || m === "block") return m;
  throw new Error(`BRIDGE_SOLANA_SYNC_MODE must be "program" or "block" (got "${m}")`);
}

/** `BRIDGE_SOLANA_POLL_MS`: an integer ≥ 1000, default 6000 (S2). */
export function parseSolanaPollMs(v: string | undefined): number {
  if (v === undefined || v.trim() === "") return DEFAULT_SOLANA_POLL_MS;
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_SOLANA_POLL_MS) {
    throw new Error(`BRIDGE_SOLANA_POLL_MS must be an integer of at least ${MIN_SOLANA_POLL_MS} (ms)`);
  }
  return n;
}

export type BridgeNodeSettings = {
  mode: BridgeNodeMode;
  deploymentFile: string;
  solana: SolanaDeployment;
  midnight: MidnightDeployment;
  solanaRpcUrl: string;
  solanaNetworkId: "localnet" | "devnet" | "testnet";
  midnightUrls: BridgeMidnightUrls;
  solanaSync: {
    /** `program` or `block` (BRIDGE_SOLANA_SYNC_MODE). */
    syncMode: BridgeSolanaSyncMode;
    /** Program mode: the engine's `pollingInterval` (BRIDGE_SOLANA_POLL_MS). */
    programPollMs: number;
    // Block mode only (program mode ignores them):
    confirmationDepth: number;
    stepSize: number;
    /** Block mode's `pollingInterval` (BRIDGE_SOLANA_POLLING_MS). */
    pollingInterval: number;
    // Both modes:
    delayMs: number;
    /** The engine's getBlock reading (00057 Q16): concurrency cap, pacing, 429 backoff, tx version. */
    getBlockConcurrency: number;
    getBlockMinIntervalMs: number;
    rateLimitRetries: number;
    rateLimitBackoffMs: number;
    rateLimitMaxBackoffMs: number;
    maxSupportedTransactionVersion: number;
  };
  midnightSync: { pollingInterval: number; delayMs: number };
};

const envInt = (k: string, d: number): number => {
  const v = process.env[k];
  if (v === undefined || v.trim() === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${k} must be a non-negative integer`);
  return n;
};

/** The engine's getBlock settings for the Solana sync (00057 Q16), from the environment. */
function getBlockReading() {
  return {
    getBlockConcurrency: Math.max(1, envInt("BRIDGE_SOLANA_GETBLOCK_CONCURRENCY", 8)),
    getBlockMinIntervalMs: envInt("BRIDGE_SOLANA_GETBLOCK_MIN_INTERVAL_MS", 0),
    rateLimitRetries: envInt("BRIDGE_SOLANA_RATE_LIMIT_RETRIES", 10),
    rateLimitBackoffMs: envInt("BRIDGE_SOLANA_RATE_LIMIT_BACKOFF_MS", 500),
    rateLimitMaxBackoffMs: envInt("BRIDGE_SOLANA_RATE_LIMIT_MAX_BACKOFF_MS", 15_000),
    maxSupportedTransactionVersion: envInt("BRIDGE_SOLANA_MAX_TX_VERSION", 1),
  };
}

/** The sync mode and poll interval from the environment; warns once about block-only settings in program mode (S1–S3). */
function solanaSyncMode(mode: BridgeNodeMode, warn: (m: string) => void) {
  const syncMode = parseSolanaSyncMode(process.env.BRIDGE_SOLANA_SYNC_MODE, mode);
  const programPollMs = parseSolanaPollMs(process.env.BRIDGE_SOLANA_POLL_MS);
  if (syncMode === "program") {
    const set = BLOCK_MODE_ONLY_SETTINGS.filter((k) => (process.env[k] ?? "").trim() !== "");
    if (set.length > 0) {
      warn(
        `[bridge-node] BRIDGE_SOLANA_SYNC_MODE=program ignores ${set.join(", ")} (block mode only); ` +
          `program mode polls every BRIDGE_SOLANA_POLL_MS (${programPollMs} ms).`,
      );
    }
  }
  return { syncMode, programPollMs };
}

/**
 * Reads the deployment file and the endpoints for `mode`. `warn` receives at
 * most one line: block-only Solana settings that program mode ignores (S3).
 */
export function loadBridgeNodeSettings(
  mode: BridgeNodeMode,
  warn: (m: string) => void = (m) => console.warn(m),
): BridgeNodeSettings {
  const name = mode === "local" ? LOCAL_DEPLOYMENT : (process.env.BRIDGE_DEPLOYMENT ?? "devnet-stagenet");
  const file = deploymentPath(name);
  const d = readDeployment(name);
  if (!d?.solana) throw new Error(`no "solana" section in ${file}`);
  if (!d.midnight) throw new Error(`no "midnight" section in ${file}; deploy the Midnight contract first`);
  const solana = d.solana;
  const midnight = d.midnight as unknown as MidnightDeployment;
  const urls = midnightUrls(mode === "local" ? "local" : "stagenet");
  if (midnight.networkId !== urls.id) {
    throw new Error(`deployment ${file} is for Midnight network ${midnight.networkId}, the node targets ${urls.id}`);
  }
  if (Buffer.from(new PublicKey(solana.mint).toBytes()).toString("hex") !== midnight.sourceMint) {
    throw new Error(`deployment ${file}: the Midnight contract seals another SPL mint than solana.mint`);
  }
  const solanaRpcUrl = mode === "local" ? DEV_SOLANA_RPC_URL : liveSolanaRpcUrl();
  const sync = solanaSyncMode(mode, warn);
  return {
    mode,
    deploymentFile: file,
    solana,
    midnight,
    solanaRpcUrl,
    // Informational for the sync config: the deployment's cluster when it is a
    // public one, else localnet (a custom cluster, e.g. a stand-in validator).
    solanaNetworkId: mode === "local" ? "localnet" : solana.cluster === "devnet" || solana.cluster === "testnet" ? solana.cluster : "localnet",
    midnightUrls: urls,
    solanaSync: mode === "local"
      ? {
          ...sync,
          confirmationDepth: envInt("BRIDGE_SOLANA_CONFIRMATION_DEPTH", 32),
          stepSize: envInt("BRIDGE_SOLANA_STEP_SIZE", 10),
          pollingInterval: envInt("BRIDGE_SOLANA_POLLING_MS", 2000),
          delayMs: envInt("BRIDGE_SOLANA_DELAY_MS", 2400),
          ...getBlockReading(),
        }
      : {
          ...sync,
          // Block mode on devnet: ~4.19 slots/s (AA 00064 R2), so 32 slots ≈ 8 s.
          // One getBlock per slot takes ~0.5 s even on a private RPC, so the
          // engine reads a step's slots concurrently (8 in flight by default,
          // halved on HTTP 429); a step of 24 slots is three such batches. On a
          // rate-limited public RPC, lower BRIDGE_SOLANA_GETBLOCK_CONCURRENCY or
          // set BRIDGE_SOLANA_GETBLOCK_MIN_INTERVAL_MS (e.g. 1700 for 6 calls /
          // 10 s). Program mode (the live default) reads none of these.
          confirmationDepth: envInt("BRIDGE_SOLANA_CONFIRMATION_DEPTH", 32),
          stepSize: envInt("BRIDGE_SOLANA_STEP_SIZE", 24),
          pollingInterval: envInt("BRIDGE_SOLANA_POLLING_MS", 4000),
          delayMs: envInt("BRIDGE_SOLANA_DELAY_MS", 6000),
          ...getBlockReading(),
        },
    midnightSync: {
      pollingInterval: envInt("BRIDGE_MIDNIGHT_POLLING_MS", 1000),
      delayMs: envInt("BRIDGE_MIDNIGHT_DELAY_MS", mode === "local" ? 6000 : 18000),
    },
  };
}

async function solanaBlockTimeMs(rpcUrl: string, slot: number): Promise<number | null> {
  const conn = new Connection(rpcUrl, "confirmed");
  for (let s = slot; s < slot + 50; s++) {
    try {
      const t = await conn.getBlockTime(s);
      if (t !== null) return t * 1000;
    } catch {
      /* skipped slot or not available: try the next one */
    }
  }
  return null;
}

async function midnightBlockTimeMs(indexer: string, height: number): Promise<number | null> {
  try {
    const res = await fetch(indexer, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: `query { block(offset: { height: ${height} }) { timestamp } }` }),
    });
    const j = (await res.json()) as { data?: { block?: { timestamp?: number } } };
    const t = j.data?.block?.timestamp;
    if (typeof t !== "number") return null;
    return t < 1e12 ? t * 1000 : t;
  } catch {
    return null;
  }
}

/**
 * The NTP main chain's start time. An existing database keeps its own (the
 * night-bitcoin-v2 pattern), so block numbers stay stable across restarts.
 * A fresh database starts 30 s before the earlier of the two deployment start
 * blocks, so a full re-sync replays every transfer.
 */
export async function resolveNtpStartTime(s: BridgeNodeSettings): Promise<number> {
  try {
    const result = await getConnection().query(
      `SELECT page, page_number FROM effectstream.sync_protocol_pagination
       WHERE protocol_name = $1 ORDER BY page_number ASC LIMIT 1`,
      [MAIN_SYNC_PROTOCOL],
    );
    const row = result?.rows?.[0];
    if (row) return Number(row.page.root) - Number(row.page_number) * 1000;
  } catch {
    /* database not initialized yet */
  }
  const [sol, mid] = await Promise.all([
    solanaBlockTimeMs(s.solanaRpcUrl, s.solana.startSlot),
    midnightBlockTimeMs(s.midnightUrls.indexer, s.midnight.startBlockHeight),
  ]);
  const known = [sol, mid].filter((t): t is number => t !== null);
  if (known.length > 0) return Math.min(...known) - 30_000;
  const fallback = Math.min(Date.parse(s.solana.updatedAt), Date.parse(s.midnight.updatedAt));
  return (Number.isFinite(fallback) ? fallback : Date.now()) - 10 * 60_000;
}

export function buildBridgeConfig(s: BridgeNodeSettings, ntpStartTime: number) {
  const contract = {
    ledger: bridgeLedger,
    ledgerFromTxStateHex: midnightLedgerFromTxStateHex(bridgeLedger as never, BridgeContractState as never),
  };
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("solana-midnight-bridge"))
    .buildNetworks((b) =>
      b
        .addNetwork({ name: "ntp", type: ConfigNetworkType.NTP, startTime: ntpStartTime, blockTimeMS: 1000 })
        .addNetwork({
          name: "solana",
          type: ConfigNetworkType.SOLANA,
          rpcUrl: s.solanaRpcUrl,
          networkId: s.solanaNetworkId,
        })
        .addNetwork({
          name: "midnight",
          type: ConfigNetworkType.MIDNIGHT,
          genesisHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
          networkId: s.midnightUrls.id,
          nodeUrl: s.midnightUrls.node,
        }),
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.ntp,
          () => ({
            name: MAIN_SYNC_PROTOCOL,
            type: ConfigSyncProtocolType.NTP_MAIN,
            chainUri: "",
            startBlockHeight: 1,
            pollingInterval: 500,
          }),
        )
        .addParallel(
          (n) => (n as any).solana,
          () => ({
            name: SOLANA_SYNC_PROTOCOL,
            type: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
            startBlockHeight: s.solana.startSlot,
            // AA 00064: the engine's mode; its pollingInterval is program mode's
            // poll (6 s) or block mode's fetch-loop interval.
            mode: s.solanaSync.syncMode,
            pollingInterval: s.solanaSync.syncMode === "program" ? s.solanaSync.programPollMs : s.solanaSync.pollingInterval,
            delayMs: s.solanaSync.delayMs,
            confirmationDepth: s.solanaSync.confirmationDepth,
            stepSize: s.solanaSync.stepSize,
            getBlockConcurrency: s.solanaSync.getBlockConcurrency,
            getBlockMinIntervalMs: s.solanaSync.getBlockMinIntervalMs,
            rateLimitRetries: s.solanaSync.rateLimitRetries,
            rateLimitBackoffMs: s.solanaSync.rateLimitBackoffMs,
            rateLimitMaxBackoffMs: s.solanaSync.rateLimitMaxBackoffMs,
            maxSupportedTransactionVersion: s.solanaSync.maxSupportedTransactionVersion,
          }),
        )
        .addParallel(
          (n) => (n as any).midnight,
          () => ({
            name: MIDNIGHT_SYNC_PROTOCOL,
            type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
            startBlockHeight: s.midnight.startBlockHeight,
            pollingInterval: s.midnightSync.pollingInterval,
            delayMs: s.midnightSync.delayMs,
            indexer: s.midnightUrls.indexer,
          }),
        ),
    )
    .buildPrimitives((b) =>
      b
        .addPrimitive(
          (sp) => (sp as any)[SOLANA_SYNC_PROTOCOL],
          () => ({
            name: "BridgeSolanaProgramLog",
            type: PrimitiveTypeSolanaProgramLog,
            startBlockHeight: s.solana.startSlot,
            programId: s.solana.programId,
            stateMachinePrefix: SOLANA_LOG_PREFIX,
          }),
        )
        .addPrimitive(
          (sp) => (sp as any)[MIDNIGHT_SYNC_PROTOCOL],
          () => ({
            name: "BridgeMidnightState",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: s.midnight.startBlockHeight,
            contractAddress: s.midnight.contractAddress,
            stateMachinePrefix: MIDNIGHT_STATE_PREFIX,
            contract: contract as any,
            networkId: s.midnightUrls.id,
          }),
        ),
    )
    .build();
}

/**
 * 00058 FR-010: the Solana RPC must be the cluster the deployment was made on. A deployment file
 * written before 00058 has no `genesisHash`: that is accepted with a warning.
 */
export async function checkSolanaGenesis(
  s: Pick<BridgeNodeSettings, "solana" | "solanaRpcUrl" | "deploymentFile">,
  getGenesisHash: () => Promise<string> = () => new Connection(s.solanaRpcUrl, "confirmed").getGenesisHash(),
  warn: (m: string) => void = (m) => console.warn(m),
): Promise<{ checked: boolean; genesis: string }> {
  const genesis = await getGenesisHash();
  if (!s.solana.genesisHash) {
    warn(`[bridge-node] ${s.deploymentFile} records no solana.genesisHash (an older file); the Solana RPC's genesis ${genesis} is not checked`);
    return { checked: false, genesis };
  }
  if (genesis !== s.solana.genesisHash) {
    throw new Error(
      `the Solana RPC ${redactRpcUrl(s.solanaRpcUrl)} has genesis ${genesis}, but ${s.deploymentFile} was deployed on genesis ${s.solana.genesisHash}; refusing to start`,
    );
  }
  return { checked: true, genesis };
}

/** The Solana sync in one phrase: the mode and its interval (S6). */
export function describeSolanaSync(s: Pick<BridgeNodeSettings, "solanaSync">): string {
  const y = s.solanaSync;
  return y.syncMode === "program"
    ? `solanaSync=program poll=${y.programPollMs}ms`
    : `solanaSync=block polling=${y.pollingInterval}ms step=${y.stepSize} depth=${y.confirmationDepth}`;
}

/** One line for the logs: what this node watches (no secrets; RPC host only). */
export function describeSettings(s: BridgeNodeSettings): string {
  return [
    `mode=${s.mode}`,
    `deployment=${s.deploymentFile}`,
    `solana=${redactRpcUrl(s.solanaRpcUrl)} program=${s.solana.programId} startSlot=${s.solana.startSlot}`,
    describeSolanaSync(s),
    `midnight=${s.midnightUrls.id} contract=${s.midnight.contractAddress} startBlock=${s.midnight.startBlockHeight}`,
  ].join(" ");
}
