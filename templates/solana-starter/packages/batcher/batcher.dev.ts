import path from "node:path";
import { main, suspend } from "effection";
import {
  createNewBatcher,
  FileStorage,
  InMemoryRateLimitStore,
  type BatcherConfig,
} from "@effectstream/batcher-sdk";
import { createSolanaAdapter } from "./solana-adapter.ts";
import { formatRateLimitSummary } from "./rate-limit-summary.ts";
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
  /**
   * Spelled out rather than left to the defaults, because the defaults are easy
   * to misread as "off". Omitting `rateLimit` does NOT disable rate limiting:
   * the server falls back to 1000 requests per 24 hours, keyed by whatever
   * strategy the adapter declares.
   *
   * Solana charges 5000 lamports per signature. Every sponsored transaction has
   * at least the user's and sponsor's signatures, so its base fee is at least
   * 10000 lamports and can be higher when more signers are required.
   *
   * The values below are the dev posture: a short window so a local test that
   * hammers the endpoint recovers in a minute instead of being locked out for a
   * day. At the two-signature minimum, 100000 accepted transactions cost at
   * least 1 SOL of base fees.
   *
   * Keying is per IP, which is the adapter default. The published SDK's legacy
   * limiter applies this before signature verification and does not provide a
   * target-global sponsor cap. `LINK_LOCAL=1` exercises the monorepo's layered
   * limiter: a pre-authentication IP ceiling followed by atomic authenticated
   * identity and target-global buckets. The startup summary below detects and
   * reports which capability is actually present instead of inferring it from
   * a package version.
   *
   * `InMemoryRateLimitStore` is per process, so counts reset on restart and are
   * not shared across replicas. Pass a `store` backed by Redis or Postgres for
   * a real deployment.
   */
  rateLimit: {
    maxRequests: Number(process.env.BATCHER_RATE_LIMIT_MAX ?? "100000"),
    windowMs: Number(process.env.BATCHER_RATE_LIMIT_WINDOW_MS ?? "60000"),
    store: new InMemoryRateLimitStore(),
  },
  enableHttpServer: true,
  enableEventSystem: true,
  port: PORT,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);
const effectiveRateLimit = batcher.config.rateLimit!;
const supportsLayeredRateLimits = typeof (
  effectiveRateLimit.store as { consume?: unknown } | undefined
)?.consume === "function";
const effectiveGlobalMaxRequests =
  (effectiveRateLimit as typeof effectiveRateLimit & {
    globalMaxRequests?: number;
  }).globalMaxRequests ?? effectiveRateLimit.maxRequests;
const effectivePreAuthMaxRequests =
  (effectiveRateLimit as typeof effectiveRateLimit & {
    preAuthMaxRequests?: number;
  }).preAuthMaxRequests ?? effectiveGlobalMaxRequests;
const effectiveRateLimitStrategy =
  (solana as typeof solana & {
    getRateLimitKeyStrategy?: () => string;
  }).getRateLimitKeyStrategy?.() ?? "ip";

main(function* () {
  console.log("Starting Solana starter batcher...");
  console.log(`  rpc:       ${RPC_URL}`);
  console.log(`  sync:      ${SYNC_PROTOCOL_NAME}`);
  console.log(`  namespace: ${NAMESPACE}`);
  console.log(`  keypair:   ${BATCHER_KEYPAIR}`);
  // Printed because a 429 in the wild is otherwise hard to attribute: the
  // caller sees a rejection with no indication of which budget it hit.
  console.log(
    `  ${formatRateLimitSummary({
      maxRequests: effectiveRateLimit.maxRequests,
      preAuthMaxRequests: effectivePreAuthMaxRequests,
      globalMaxRequests: effectiveGlobalMaxRequests,
      windowMs: effectiveRateLimit.windowMs,
      strategy: effectiveRateLimitStrategy,
      supportsLayeredRateLimits,
    })}`,
  );

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
