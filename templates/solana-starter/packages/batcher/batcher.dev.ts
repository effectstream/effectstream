import path from "node:path";
import { main, suspend } from "effection";
import {
  createNewBatcher,
  FileStorage,
  type BatcherConfig,
} from "@effectstream/batcher-sdk";
import { createSolanaAdapter } from "./solana-adapter.ts";
import {
  DEV_RPC_URL,
  DEV_NAMESPACE,
  COUNTER_PROGRAM_ID,
} from "@solana-starter/contracts-solana";

/**
 * Dev batcher entry point.
 *
 * HTTP server: http://localhost:3334
 *   POST /send-input — see `@effectstream/batcher-sdk` HTTP API.
 *
 * The adapter is `SolanaAdapter` (see solana-adapter.ts). The frontend
 * signs the inner counter instruction and submits the partial tx here;
 * we add the fee-payer signature and submit to the local validator.
 *
 * IMPORTANT: `namespace` below MUST match the `securityNamespace` the
 * frontend uses to scope its signature. A mismatch produces
 * `401 Invalid signature` from this process.
 */
const PORT = Number(process.env.BATCHER_PORT ?? "3334");
const RPC_URL = process.env.SOLANA_RPC_URL ?? DEV_RPC_URL;
const SYNC_PROTOCOL_NAME =
  process.env.SOLANA_SYNC_PROTOCOL_NAME ?? "parallelSolanaRPC";
const NAMESPACE = process.env.BATCHER_NAMESPACE ?? DEV_NAMESPACE;
const POLLING_INTERVAL_MS = Number(process.env.BATCHER_POLLING_MS ?? "1000");

const PKG_DIR = import.meta.dirname!;
const BATCHER_KEYPAIR = path.join(
  PKG_DIR,
  "keypair",
  "batcher-wallet.json",
);

const solana = createSolanaAdapter({
  rpcUrl: RPC_URL,
  batcherKeypairPath: BATCHER_KEYPAIR,
  syncProtocolName: SYNC_PROTOCOL_NAME,
  targetProgramId: COUNTER_PROGRAM_ID,
  // The counter program creates a PDA funded by the sponsor, so it must be
  // allowed to appear as the rent payer in the sponsored instruction.
  allowSponsorAsInstructionAccount: true,
});

const config: BatcherConfig = {
  pollingIntervalMs: POLLING_INTERVAL_MS,
  adapters: { solana },
  defaultTarget: "solana",
  namespace: NAMESPACE,
  batchingCriteria: {
    // Each Solana transaction carries one counter instruction and has
    // already been signed by the user; submit them as soon as they arrive.
    // The SolanaAdapter does not actually merge multiple txs into one
    // ( it can't — Solana txs don't compose that way ), so size=1 keeps
    // latency low while still flowing through the batcher's queue + retry
    // logic.
    solana: { criteriaType: "size", maxBatchSize: 1 },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port: PORT,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);

main(function* () {
  console.log("Starting Solana starter batcher...");
  console.log(`  rpc:       ${RPC_URL}`);
  console.log(`  sync:      ${SYNC_PROTOCOL_NAME}`);
  console.log(`  namespace: ${NAMESPACE}`);
  console.log(`  keypair:   ${BATCHER_KEYPAIR}`);

  batcher.addStateTransition("startup", ({ publicConfig }) => {
    console.log(
      `  polling every ${publicConfig.pollingIntervalMs} ms, target=${publicConfig.defaultTarget}`,
    );
  });

  batcher.addStateTransition("http:start", ({ port }) => {
    console.log(`  HTTP server ready on http://localhost:${port}`);
  });

  try {
    yield* batcher.runBatcher();
  } catch (err) {
    console.error("Batcher error:", err);
    yield* batcher.gracefulShutdownOp();
  }

  yield* suspend();
});
