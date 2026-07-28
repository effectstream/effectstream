/**
 * Operator incident report for a detected reorg.
 *
 * Nothing is repaired automatically — rolling state back is destructive and
 * depends on judgement this process does not have. Instead, when a source chain
 * rewrites history the node writes a self-contained report to
 * `EFFECTSTREAM_INCIDENT_PATH` (default `./incidents`) containing what happened,
 * what state was derived from the affected blocks, and the exact sequence and
 * SQL to act on it.
 *
 * The report leads with impact, because it decides whether there is anything to
 * do at all. Every table that holds derived state keys it by effectstream block
 * height, so "which blocks were affected" answers "what was derived from them"
 * directly. In the common case the answer is *nothing* — the reorg touched
 * empty blocks — and the report says so plainly rather than alarming an
 * operator into an unnecessary restore.
 *
 * A `.json` twin is written alongside the `.md` so tooling can consume the same
 * facts without parsing prose.
 */
import { call, type Operation, until } from "effection";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PoolClient } from "pg";
import type { ReorgDetection } from "@effectstream/sync";
import {
  countAppEventsInRange,
  countInputResultsInRange,
  countNoncesInRange,
  countPrimitivesInRange,
  getBlockRangeInfo,
  getEffectstreamHeightForSourceBlock,
} from "@effectstream/db";
import { ENV } from "@effectstream/utils/node-env";

export type ReorgImpact = {
  /** Effectstream block range whose state derives from the reorged blocks. */
  fromHeight: number | null;
  toHeight: number | null;
  blockCount: number;
  primitives: { primitiveName: string; count: number }[];
  inputs: { total: number; succeeded: number; failed: number };
  appEvents: number;
  nonces: number;
  /** True when nothing at all was derived from the affected blocks. */
  isEmpty: boolean;
};

export type ReorgReport = {
  detection: ReorgDetection;
  impact: ReorgImpact;
  /**
   * True when the fork point equals the oldest hash we still retain, so the
   * real fork may be deeper than reported and the affected range is a floor.
   */
  depthExceedsHistory: boolean;
  reportPath: string;
};

/** Where incident reports are written. Kept separate from snapshots so that
 *  snapshot retention can never delete an incident report. */
function incidentDir(): string {
  return resolve(ENV.getString("EFFECTSTREAM_INCIDENT_PATH", "./incidents"));
}

function* assessImpact(
  detection: ReorgDetection,
  dbConn: PoolClient,
): Operation<ReorgImpact> {
  // Translate "source chain diverged from block N" into the effectstream block
  // range built from block N onward.
  const [heightRow] = yield* until(
    getEffectstreamHeightForSourceBlock.run({
      protocol_name: detection.protocolName,
      // The conservative bound, not `forkBlock`: recorded history can have
      // gaps, so the true fork may sit below the lowest mismatching row we hold.
      block_number: detection.forkBlockLowerBound,
    }, dbConn),
  );
  const fromHeight = heightRow?.min_height ?? null;

  if (fromHeight == null) {
    return {
      fromHeight: null,
      toHeight: null,
      blockCount: 0,
      primitives: [],
      inputs: { total: 0, succeeded: 0, failed: 0 },
      appEvents: 0,
      nonces: 0,
      isEmpty: true,
    };
  }

  // Everything from there to the head is downstream of the reorg. Bounded by
  // int4 max rather than Number.MAX_SAFE_INTEGER: every block_height column is
  // INTEGER, and a bigger literal is rejected as out of range.
  const toHeight = 2_147_483_647;
  const [range] = yield* until(
    getBlockRangeInfo.run({ from_height: fromHeight, to_height: toHeight }, dbConn),
  );
  const primitives = yield* until(
    countPrimitivesInRange.run({ from_height: fromHeight, to_height: toHeight }, dbConn),
  );
  const [inputs] = yield* until(
    countInputResultsInRange.run({ from_height: fromHeight, to_height: toHeight }, dbConn),
  );
  const [events] = yield* until(
    countAppEventsInRange.run({ from_height: fromHeight, to_height: toHeight }, dbConn),
  );
  const [nonces] = yield* until(
    countNoncesInRange.run({ from_height: fromHeight, to_height: toHeight }, dbConn),
  );

  const primitiveRows = primitives.map((p) => ({
    primitiveName: p.primitive_name,
    count: p.count ?? 0,
  }));
  const inputTotal = inputs?.total ?? 0;
  const eventCount = events?.count ?? 0;
  const nonceCount = nonces?.count ?? 0;
  const primitiveTotal = primitiveRows.reduce((sum, p) => sum + p.count, 0);

  return {
    fromHeight,
    toHeight: range?.max_height ?? null,
    blockCount: range?.block_count ?? 0,
    primitives: primitiveRows,
    inputs: {
      total: inputTotal,
      succeeded: inputs?.succeeded ?? 0,
      failed: inputs?.failed ?? 0,
    },
    appEvents: eventCount,
    nonces: nonceCount,
    isEmpty: primitiveTotal === 0 && inputTotal === 0 && eventCount === 0 &&
      nonceCount === 0,
  };
}

function renderMarkdown(
  report: Omit<ReorgReport, "reportPath">,
  detectedAt: string,
): string {
  const { detection, impact, depthExceedsHistory } = report;

  const header = [
    `# Chain reorganisation detected — ${detection.protocolName}`,
    ``,
    `- **Detected at**: ${detectedAt}`,
    `- **Sync protocol**: \`${detection.protocolName}\``,
    `- **Diverges from source block**: ${detection.forkBlockLowerBound}` +
      (detection.forkBlockLowerBound !== detection.forkBlock
        ? ` (first confirmed mismatch at ${detection.forkBlock}; history between` +
          ` the two was committed as one coalesced run and holds no per-block hash)`
        : ``),
    `- **Previous head**: ${detection.previousHead} (depth ${detection.depth})`,
    `- **Hash recorded**: \`${detection.recordedHash}\``,
    `- **Hash now reported**: \`${detection.currentHash ?? "(block no longer exists)"}\``,
    ``,
  ];

  if (depthExceedsHistory) {
    header.push(
      `> **The fork point may be deeper than reported.** It matches the oldest`,
      `> block hash still retained, so the true divergence could start earlier.`,
      `> Treat the affected range below as a lower bound.`,
      ``,
    );
  }

  const verdict = impact.isEmpty
    ? [
      `## Impact: none — no action required`,
      ``,
      `The reorganised blocks produced no state: no primitives were recorded, no ` +
      `state-machine inputs ran, no app events were published and no nonces were ` +
      `consumed in effectstream blocks ${impact.fromHeight ?? "-"}–${impact.toHeight ?? "-"}.`,
      ``,
      `The node has re-synced or will re-sync the replacement blocks normally. ` +
      `**You do not need to restore from a snapshot.** This report exists so the ` +
      `event is on record, not because something is broken.`,
      ``,
    ]
    : [
      `## Impact: state was derived from the reorganised blocks`,
      ``,
      `Effectstream blocks **${impact.fromHeight}–${impact.toHeight}** were built on ` +
      `source blocks that no longer exist on ${detection.protocolName}. ` +
      `${impact.blockCount} block(s) in that range retain state; the rest were empty ` +
      `and have already been pruned. What derives from them, and is now suspect:`,
      ``,
      `| What | Count |`,
      `| --- | --- |`,
      `| State-machine inputs executed | ${impact.inputs.total} (${impact.inputs.succeeded} succeeded, ${impact.inputs.failed} failed) |`,
      `| App events published | ${impact.appEvents} |`,
      `| Nonces consumed | ${impact.nonces} |`,
      ...impact.primitives.map((p) =>
        `| Primitive \`${p.primitiveName}\` | ${p.count} |`
      ),
      ``,
      impact.appEvents > 0
        ? `**${impact.appEvents} app event(s) were already published to subscribers.**\n` +
          `Those cannot be recalled. Any downstream consumer has already acted on\n` +
          `them, so a database restore will leave the node and its consumers\n` +
          `disagreeing until those consumers are reconciled separately.`
        : `No app events were published from the affected range, so nothing has\n` +
          `left this node.`,
      ``,
    ];

  const runbook = impact.isEmpty ? [] : [
    `## If you decide to roll back`,
    ``,
    `Nothing below runs automatically. Read it through before starting, and take`,
    `your own backup first — these steps discard data.`,
    ``,
    `Rolling back also discards state derived from **other** chains in the same`,
    `block range, which did not reorg. That state is re-derived on re-sync, which`,
    `is correct as long as those chains are still serving the same history.`,
    ``,
    `**1. Stop the node.** Nothing below is safe while it is applying blocks.`,
    ``,
    `**2. Take a backup of the current state**, so this is reversible:`,
    ``,
    "```bash",
    `pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c \\`,
    `  -f "pre-rollback-$(date -u +%Y%m%dT%H%M%SZ).dump"`,
    "```",
    ``,
    `**3. Pick a snapshot from before effectstream block ${impact.fromHeight}.**`,
    `Each snapshot has a \`.json\` manifest recording the block height it was`,
    `taken at; choose the newest whose \`blockHeight\` is below ${impact.fromHeight}:`,
    ``,
    "```bash",
    `grep -l '"blockHeight"' "$EFFECTSTREAM_SNAPSHOT_PATH"/*.json \\`,
    `  | xargs -I{} sh -c 'echo "{} $(grep -o \\"blockHeight\\":[0-9]* {})"' \\`,
    `  | sort -t: -k2 -n`,
    "```",
    ``,
    `**4. Restore it.** This replaces the database wholesale:`,
    ``,
    "```bash",
    `pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \\`,
    `  --clean --if-exists <chosen-snapshot>.dump`,
    "```",
    ``,
    `**5. Clear the stale resume markers** so the node re-fetches the affected`,
    `range from the reorganised chain rather than resuming past it:`,
    ``,
    "```sql",
    `-- Resume position for the reorged protocol.`,
    `DELETE FROM effectstream.sync_protocol_pagination`,
    ` WHERE protocol_name = '${detection.protocolName}'`,
    `   AND page_number >= ${detection.forkBlock};`,
    ``,
    `-- Recorded hashes for blocks that no longer exist.`,
    `DELETE FROM effectstream.sync_protocol_block_hash`,
    ` WHERE protocol_name = '${detection.protocolName}'`,
    `   AND block_number >= ${detection.forkBlock};`,
    "```",
    ``,
    `**6. Restart the node.** It resumes from the restored height and re-syncs`,
    `the replacement blocks. Watch \`/health\` until \`status\` returns to \`ok\`.`,
    ``,
    `### If you have no suitable snapshot`,
    ``,
    `Re-sync from genesis into an empty database. Slower, but it needs no`,
    `snapshot and produces the same state.`,
    ``,
  ];

  const footer = [
    `## Why this was not fixed automatically`,
    ``,
    `Restoring a snapshot discards committed state, cannot recall published`,
    `events, and may be the wrong call — for a shallow reorg over empty blocks it`,
    `is strictly worse than doing nothing. The node therefore records the facts`,
    `and leaves the decision to you.`,
    ``,
    `The node is **still running and still syncing**. If state was affected, it`,
    `is now building on blocks that no longer exist on ${detection.protocolName}.`,
    ``,
  ];

  return [...header, ...verdict, ...runbook, ...footer].join("\n");
}

/**
 * Assess impact, write the report pair, and return the markdown path.
 *
 * Registered as the sync service's reorg handler in `main.ts`.
 */
export function* writeReorgReport(
  detection: ReorgDetection,
  dbConn: PoolClient,
): Operation<string | undefined> {
  const impact = yield* assessImpact(detection, dbConn);

  // The fork sitting on the oldest block we still have a hash for means the
  // scan hit the bottom of its retained history; the real fork could be deeper.
  const depthExceedsHistory =
    detection.forkBlockLowerBound === detection.oldestRetainedBlock;

  const detectedAt = new Date(detection.detectedAtMs).toISOString();
  const stamp = detectedAt.replace(/:/g, "-").replace(/\.\d{3}/, "");
  const dir = incidentDir();
  const base = `reorg-${stamp}-${detection.protocolName}`;
  const reportPath = join(dir, `${base}.md`);

  const partial = { detection, impact, depthExceedsHistory };

  yield* call(() => mkdir(dir, { recursive: true }));
  yield* call(() =>
    writeFile(reportPath, renderMarkdown(partial, detectedAt), "utf8")
  );
  yield* call(() =>
    writeFile(
      join(dir, `${base}.json`),
      JSON.stringify({ ...partial, reportPath }, null, 2),
      "utf8",
    )
  );

  return reportPath;
}
