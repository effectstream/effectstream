/**
 * Sync liveness for `/health`.
 *
 * `/health` used to report database reachability only. That misses every
 * failure this service actually suffers: a blackholed RPC, a producer whose
 * stream ended, a chain that stopped advancing. All of them end the same way —
 * the merge blocks on one chain's page and block production stops — while the
 * database stays perfectly healthy. A node that has not applied a block in an
 * hour would answer `200 {"status":"ok"}`.
 *
 * Two deliberate choices:
 *
 * 1. **Liveness is measured in wall-clock time since the last APPLIED block**,
 *    not in block-timestamp lag. A chain replaying history is legitimately
 *    hours behind in block time while being perfectly healthy; what matters is
 *    whether the pipeline is still moving.
 *
 * 2. **503 is reserved for "not doing its job"** — database unreachable, or no
 *    block applied within the threshold. A chain that is erroring or restarting
 *    its producer while blocks still flow reports `degraded` with a 200, so an
 *    orchestrator does not kill a node that is recovering on its own.
 */
import type { AllSyncProtocols } from "@effectstream/sync";
import { poolErrors } from "@effectstream/db";
import { appliedBlockStatus } from "./apply-status.ts";
import { finalizedStreamStatus } from "./stream-status.ts";

/**
 * Node-level rollup. `ok` and `degraded` answer 200; `starting`, `stalled` and
 * `db-unreachable` answer 503 (not ready to serve).
 */
export type HealthStatus =
  | "ok"
  | "degraded"
  | "starting"
  | "stalled"
  | "db-unreachable";

/** Per-protocol rollup. `blockingMerge` is reported separately. */
export type ProtocolStatus = "ok" | "starting" | "erroring" | "wedged";

export type ProtocolHealth = {
  name: string;
  status: ProtocolStatus;
  /** Highest block of this chain that has been merged into a produced block. */
  ownBlockNumber: number | null;
  /** ms since this chain's fetch loop last completed a pass; null if never. */
  sinceLastPollMs: number | null;
  /** ms since `readData` last returned successfully; null if never. */
  sinceLastSuccessfulFetchMs: number | null;
  consecutiveErrors: number;
  /** Streaming producers only: restarts since boot. A climb means flapping. */
  producerRestarts: number;
  /** Producer failures, counted independently of `consecutiveErrors`. */
  producerErrors: number;
  /** ms since the last producer failure; null if there has never been one. */
  sinceLastProducerErrorMs: number | null;
  /**
   * True when the merge is currently waiting for THIS chain's page to advance.
   * When the node is stalled, this is the field that says where to look.
   */
  blockingMerge: boolean;
  /** In-memory fetched-not-yet-merged data, and the backpressure cap. */
  buffered: number;
  bufferCap: number;
  paused: boolean;
  /**
   * Whether this chain is monitored for reorgs at all. Reported so an
   * unmonitored chain is visibly unmonitored rather than assumed safe — only
   * fetchers implementing `getBlockHashAt` can be checked.
   */
  reorgDetectionSupported: boolean;
  /**
   * Set once a reorg has been seen, and never cleared: the node does not repair
   * itself, so this stays until an operator acts. `reportPath` points at the
   * incident report written for them.
   */
  reorgDetected: {
    forkBlock: number;
    depth: number;
    detectedAtMs: number;
    reportPath: string | null;
  } | null;
};

export type HealthReport = {
  status: HealthStatus;
  db: ReturnType<typeof poolErrors.state>;
  apply: {
    blockHeight: number | null;
    /**
     * ms since the node last applied ANY block — the liveness signal. Never
     * null: before the first block it measures from process start instead.
     */
    sinceLastAppliedMs: number;
    /** Block-time lag. Informational: large during legitimate catch-up. */
    lagMs: number | null;
  };
  finalizedStream: {
    produced: number;
    consumed: number;
    inFlight: number;
  };
  protocols: ProtocolHealth[];
};

/**
 * A fetch loop is "wedged" once its heartbeat is this many polling intervals
 * stale. Generous, because the cost of a false positive (a flapping 503) is
 * worse than noticing a genuine hang a minute late — and a hung request is now
 * bounded by `requestTimeoutMs` anyway, so a healthy loop always cycles.
 */
const WEDGED_POLL_MULTIPLE = 20;
/** Floor for the above, so fast-polling chains don't trip on a single hiccup.
 *
 * Caveat worth knowing before alerting on `wedged`: one `readData` pass fetches
 * a whole chunk, which can be many sequential RPCs, so during deep catch-up a
 * legitimately-progressing chain can exceed this without returning to the top of
 * the loop and briefly read as `wedged`. Node-level status stays 200 while
 * blocks keep applying, so this is cosmetic — but alert on the node's `status`,
 * not on a single protocol's. */
const WEDGED_MIN_MS = 60_000;

/**
 * How long after a producer failure the chain still reports `erroring`. Twice
 * the supervisor's max backoff, so a producer that recovers on its first or
 * second restart clears the flag on its own.
 */
const PRODUCER_FLAP_WINDOW_MS = 60_000;

function protocolHealth(
  protocol: AllSyncProtocols,
  now: number,
): ProtocolHealth {
  const sinceLastPollMs = protocol.lastPollAtMs > 0
    ? now - protocol.lastPollAtMs
    : null;
  const sinceLastSuccessfulFetchMs = protocol.lastSuccessfulFetchMs > 0
    ? now - protocol.lastSuccessfulFetchMs
    : null;

  // `pollingIntervalMs` is published by startSync, so this and the loop agree on
  // one value. It is 0 until startSync stamps it; fall back until then.
  const wedgedAfterMs = Math.max(
    WEDGED_POLL_MULTIPLE * (protocol.pollingIntervalMs || 1_000),
    WEDGED_MIN_MS,
  );

  const sinceLastProducerErrorMs = protocol.lastProducerErrorMs > 0
    ? now - protocol.lastProducerErrorMs
    : null;

  let status: ProtocolStatus;
  if (sinceLastPollMs != null && sinceLastPollMs > wedgedAfterMs) {
    // The loop itself stopped cycling: stuck inside a call that never returned.
    status = "wedged";
  } else if (protocol.consecutiveErrors > 0) {
    status = "erroring";
  } else if (
    sinceLastProducerErrorMs != null &&
    sinceLastProducerErrorMs < PRODUCER_FLAP_WINDOW_MS
  ) {
    // A producer that failed recently but has been restarted. Reported so a
    // flapping stream is visible, and time-bounded so a single old blip does
    // not pin the chain to `erroring` forever (which is what sharing
    // `consecutiveErrors` used to do for an idle streaming chain).
    status = "erroring";
  } else if (protocol.lastPage == null) {
    status = "starting";
  } else {
    status = "ok";
  }

  return {
    name: protocol.name,
    status,
    ownBlockNumber: protocol.lastPage?.ownBlockNumber ?? null,
    sinceLastPollMs,
    sinceLastSuccessfulFetchMs,
    consecutiveErrors: protocol.consecutiveErrors,
    producerRestarts: protocol.producerRestarts,
    producerErrors: protocol.producerErrors,
    sinceLastProducerErrorMs,
    blockingMerge: protocol.mergeWaitingForPage,
    buffered: protocol.bufferedData.size(),
    bufferCap: protocol.bufferCap,
    paused: protocol.pausedNow,
    reorgDetectionSupported: protocol.reorgDetectionSupported,
    reorgDetected: protocol.reorgDetected
      ? {
        forkBlock: protocol.reorgDetected.forkBlock,
        depth: protocol.reorgDetected.depth,
        detectedAtMs: protocol.reorgDetected.detectedAtMs,
        reportPath: protocol.reorgDetected.reportPath ?? null,
      }
      : null,
  };
}

/**
 * @param stallThresholdMs How long without applying a block counts as stalled.
 *   Callers pass the same value used for lag logging and coalescing (20× the
 *   main clock's block time, or `EFFECTSTREAM_LAG_THRESHOLD_MS`).
 */
export function buildHealthReport(
  syncProtocols: AllSyncProtocols[],
  stallThresholdMs: number,
): HealthReport {
  const now = Date.now();
  const db = poolErrors.state();
  const protocols = syncProtocols.map((p) => protocolHealth(p, now));

  const appliedAtMs = appliedBlockStatus.appliedAtMs;
  // Before the first block, measure from process start instead — a node that
  // boots and never applies anything is stalled too, and that is exactly what a
  // chain wedged from its very first request looks like.
  const sinceLastAppliedMs = appliedAtMs != null
    ? now - appliedAtMs
    : Math.round(process.uptime() * 1000);
  const appliedTs = appliedBlockStatus.timestamp;
  const neverApplied = appliedAtMs == null;

  let status: HealthStatus;
  if (db.sustained) {
    status = "db-unreachable";
  } else if (neverApplied && sinceLastAppliedMs <= stallThresholdMs) {
    // Booting: migrations, genesis sync, first merge. Not ready to serve, but
    // distinct from `stalled` so an operator can tell "still coming up" from
    // "was up and stopped".
    status = "starting";
  } else if (sinceLastAppliedMs > stallThresholdMs) {
    status = "stalled";
  } else if (
    protocols.some((p) =>
      (p.status !== "ok" && p.status !== "starting") || p.reorgDetected != null
    )
  ) {
    // Something is unhealthy but blocks are still flowing: worth alerting on,
    // not worth restarting the node over. A detected reorg lands here too —
    // the node is functioning, but its state needs a human decision, and it
    // must never read back as plain `ok` afterwards.
    status = "degraded";
  } else {
    status = "ok";
  }

  return {
    status,
    db,
    apply: {
      blockHeight: appliedBlockStatus.blockNumber,
      sinceLastAppliedMs,
      lagMs: appliedTs != null ? now - appliedTs : null,
    },
    finalizedStream: {
      produced: finalizedStreamStatus.produced,
      consumed: finalizedStreamStatus.consumed,
      inFlight: finalizedStreamStatus.produced - finalizedStreamStatus.consumed,
    },
    protocols,
  };
}

/** 503 only when the node is not (yet) doing its job; see the note at the top. */
export function healthHttpStatus(status: HealthStatus): 200 | 503 {
  return status === "ok" || status === "degraded" ? 200 : 503;
}
