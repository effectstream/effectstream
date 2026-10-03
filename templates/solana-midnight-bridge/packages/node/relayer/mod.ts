// The in-process relayer (sub-plan T4): spawned by main.ts before start(),
// like templates/preorder's dispatcher. BRIDGE_RELAYER=0 disables it (e.g. a
// read-only node, or the US4 "relayer down" test).
//
//   Solana → Midnight  observed s2m transfer → mintFromSolana signed by the
//                      operator's Solana key, through the embedded batcher's
//                      `midnight` adapter (with the recipient's key mapping)
//   Midnight → Solana  observed m2s transfer → [ATA idempotent, Release]
//                      through the `solanaOperator` adapter, unless the release
//                      receipt PDA already exists
//
// Wait mode is `wait-receipt`; the outcome goes to relayer_jobs. Completion is
// left to sync (the state machine).
import { Connection, PublicKey } from "@solana/web3.js";
import { call, run, sleep, spawn, type Operation } from "effection";
import { acquireDBMutex, getConnection, releaseDBMutex } from "@effectstream/db";
import { fetchReceipt } from "@solana-midnight-bridge/contracts-solana/chain";
import type { BridgeNodeSettings } from "../config.ts";
import { createEmbeddedBatcher } from "./batcher.ts";
import { buildMintInput, buildReleaseInput } from "./jobs.ts";
import { loadRelayerKeys } from "./keys.ts";
import { BridgeRelayer } from "./relayer.ts";

export * from "./policy.ts";
export * from "./jobs.ts";
export { BridgeRelayer, toCandidate, type RelayerDeps, type Queryable } from "./relayer.ts";
export { MIDNIGHT_BATCH_MAX_BYTES } from "./batcher.ts";

const POLL_MS = Number(process.env.BRIDGE_RELAYER_POLL_MS ?? 5_000);
const MINT_TIMEOUT_MS = Number(process.env.BRIDGE_RELAYER_MINT_TIMEOUT_MS ?? 900_000);
const RELEASE_TIMEOUT_MS = Number(process.env.BRIDGE_RELAYER_RELEASE_TIMEOUT_MS ?? 240_000);
const MUTEX = "bridge-relayer";

async function withDbMutex<T>(fn: () => Promise<T>): Promise<T> {
  await run(() => acquireDBMutex(MUTEX));
  try {
    return await fn();
  } finally {
    releaseDBMutex(MUTEX);
  }
}

export function* startRelayer(settings: BridgeNodeSettings): Operation<void> {
  if (process.env.BRIDGE_RELAYER === "0") {
    console.log("[relayer] disabled (BRIDGE_RELAYER=0)");
    return;
  }
  const keys = loadRelayerKeys(settings);
  const conn = new Connection(settings.solanaRpcUrl, "confirmed");
  const programId = new PublicKey(settings.solana.programId);
  const embedded = createEmbeddedBatcher({
    contractAddress: settings.midnight.contractAddress,
    midnightSeed: keys.midnightSeed,
    midnightUrls: settings.midnightUrls,
    solanaRpcUrl: settings.solanaRpcUrl,
    solanaOperator: keys.solanaOperator,
    programId: settings.solana.programId,
  });
  console.log(
    `[relayer] operator ${keys.solanaOperator.publicKey.toBase58()}; contract ${settings.midnight.contractAddress}; ` +
      `provers DUST ${new URL(settings.midnightUrls.proofServer).host} / contract ${new URL(settings.midnightUrls.contractProofServer).host}`,
  );
  yield* call(() => embedded.batcher.init({ startPolling: false }));
  yield* spawn(() => embedded.batcher.runPollingLoop());

  const addrs = {
    contractAddress: settings.midnight.contractAddress,
    networkTag: settings.midnight.networkTag,
    programId: settings.solana.programId,
    mint: settings.solana.mint,
  };
  const relayer = new BridgeRelayer({
    db: getConnection(),
    withDb: withDbMutex,
    submitMint: (job) => embedded.submit(buildMintInput(job, addrs, keys.solanaOperator.secretKey).input, MINT_TIMEOUT_MS),
    submitRelease: (job) => embedded.submit(buildReleaseInput(job, addrs, keys.solanaOperator).input, RELEASE_TIMEOUT_MS),
    releaseReceiptExists: async (id) => (await fetchReceipt(conn, programId, id)) !== null,
  });
  console.log(`[relayer] polling every ${POLL_MS} ms`);
  while (true) {
    yield* sleep(POLL_MS);
    try {
      yield* call(() => relayer.tick());
    } catch (err) {
      // The tables do not exist until the runtime applies the migrations.
      const m = err instanceof Error ? err.message : String(err);
      if (!m.includes("does not exist")) console.error("[relayer] poll error:", m);
    }
  }
}
