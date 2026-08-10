/**
 * Phase 1 acceptance test: `Midnight:UnshieldedCreate` driven by a STOCK UmbraDB archive must
 * behave identically to the indexer-backed path.
 *
 * Under notify-don't-copy (plan PART G) the payload is a notification, so payload equality is no
 * longer the claim. Three things are asserted instead:
 *
 *   1. TRIGGER equality — the same (height, txHash) set fires from both sources. This is the
 *      invariant the whole migration is organised around: the state machine must advance at
 *      exactly the same points.
 *   2. READ equality — for every fired trigger, `UmbraRead.getUnshieldedCreates(txHash)` returns
 *      rows identical to the indexer's, OR a typed refusal in exactly the cases where the rows are
 *      not derivable from archived bytes (`claim_rewards`). An untyped/unexpected refusal fails.
 *   3. Controls — a negative control (a differential that has never failed proves nothing) and
 *      vacuity guards (a green run over an empty corpus proves nothing either).
 *
 * Both fetchers are the REAL `MidnightFetcher`, with only the client swapped, so this tests what
 * ships rather than a reimplementation of it.
 */
import { run } from "effection";
import pg from "pg";
import { MidnightFetcher, UmbraRead } from "@effectstream/sync";

const IDX = process.env.MIDNIGHT_INDEXER_HTTP ?? "http://indexer:8088/api/v3/graphql";
const PG = process.env.UMBRA_PG ?? "postgres://umbra:umbra@postgres:5432/umbra";
const SCHEMA = process.env.UMBRA_SCHEMA ?? "chain_archive";
const NET = process.env.UMBRA_NET ?? "undeployed";

const PRIM = {
  syncProtocol: "p",
  primitive: {
    name: "Midnight-UnshieldedCreate",
    type: "Midnight:UnshieldedCreate",
    startBlockHeight: 1,
    scheduledPrefix: "midnightUnshieldedCreate",
  },
} as any;

function fetcherFor(source: "indexer" | "umbra"): MidnightFetcher {
  return new MidnightFetcher({
    syncProtocol: {
      name: `p_${source}`, type: "midnight-parallel", startBlockHeight: 1,
      pollingInterval: 1000, stepSize: 10,
      ...(source === "indexer"
        ? { indexer: IDX }
        : { umbra: { databaseUrl: PG, schema: SCHEMA, net: NET, unsafeAllowIncompleteEffects: true } }),
    },
    network: { name: "midnight", type: "midnight", networkId: "undeployed" },
    primitives: [PRIM],
  } as any);
}

const gql = async (q: string, v?: unknown) =>
  (await (await fetch(IDX, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, variables: v }),
  })).json()) as any;

/** Triggers fired at one height, as stable `height|txHash` strings. */
async function triggersAt(f: MidnightFetcher, height: number): Promise<string[]> {
  const block = await f.client.fetchBlock(height, { unshieldedCreatedOutputs: true });
  const inputs: any[] = await run(() => f.readPrimitives(height, block, [PRIM]));
  return inputs.map((p) => `${p.syncProtocol.blockNumber}|${p.output.payload.txHash}`).sort();
}

const pool = new pg.Pool({ connectionString: PG });
const { rows: wm } = await pool.query(
  `SELECT value FROM ${SCHEMA}.watermarks WHERE kind='chain_archive' AND key=$1`, [`sync_cursor:${NET}`]);
const archiveTip = Number((wm[0]?.value as { height?: number } | undefined)?.height ?? -1);
if (archiveTip < 0) { console.error("FAIL: archive has no watermark — was the ingest run?"); process.exit(1); }

// Compare only what the archive covers; beyond it is ingest lag, not disagreement.
const heights = Array.from({ length: archiveTip + 1 }, (_, i) => i);
console.log(`Comparing heights 0..${archiveTip} (${heights.length} blocks) against stock archive ${SCHEMA}`);

const fi = fetcherFor("indexer");
const fu = fetcherFor("umbra");
const failures: string[] = [];
const firedIndexer: string[] = [];
const firedUmbra: string[] = [];

for (const h of heights) {
  const [a, b] = await Promise.all([triggersAt(fi, h), triggersAt(fu, h)]);
  firedIndexer.push(...a);
  firedUmbra.push(...b);
  if (a.join() !== b.join()) {
    failures.push(`h=${h} trigger set differs:\n    indexer: ${a.join(", ") || "(none)"}\n    umbra:   ${b.join(", ") || "(none)"}`);
  }
}
console.log(`[triggers] indexer fired ${firedIndexer.length}, umbra fired ${firedUmbra.length}`);

// (2) READ equality for every fired trigger.
const reader = new UmbraRead({
  databaseUrl: PG, schema: SCHEMA, net: NET, networkId: "undeployed",
  unsafeAllowIncompleteEffects: true,
});
let exact = 0, typedRefusals = 0, rowsCompared = 0;
for (const fired of firedUmbra) {
  const [hStr, txHash] = fired.split("|");
  const d = await gql(
    `query($h:Int!){ block(offset:{height:$h}){ transactions { hash unshieldedCreatedOutputs { owner intentHash outputIndex value tokenType } } } }`,
    { h: Number(hStr) });
  const want = ((d?.data?.block?.transactions ?? []).find((t: any) => t.hash === txHash)
    ?.unshieldedCreatedOutputs ?? []) as any[];
  const outcome = await reader.getUnshieldedCreates(txHash!);
  if (!outcome.ok) {
    // Only ClaimRewards is a legitimate refusal: its UTXO needs ledger-internal reconstruction.
    if (outcome.refusal.reason === "claim_rewards") { typedRefusals++; continue; }
    failures.push(`read ${txHash}: unexpected refusal "${outcome.refusal.reason}"`);
    continue;
  }
  const key = (x: any) =>
    `${x.owner}|${x.intentHash}|${x.outputIndex}|${x.value}|${String(x.tokenType).toLowerCase()}`;
  const a = want.map(key).sort().join("\n");
  const b = outcome.outputs.map(key).sort().join("\n");
  if (a === b) { exact++; rowsCompared += outcome.outputs.length; }
  else failures.push(`read ${txHash}: rows differ\n    indexer(${want.length}): ${a}\n    umbra(${outcome.outputs.length}): ${b}`);
}
console.log(`[reads] exact=${exact} typedClaimRewardsRefusals=${typedRefusals} rowsCompared=${rowsCompared}`);

// (3a) Vacuity guards. A green run over a corpus that exercises nothing proves nothing, and this
// suite has already caught exactly that once.
if (firedIndexer.length === 0) {
  failures.push("no trigger fired at all — the corpus exercises nothing, so a match here is vacuous");
}
if (rowsCompared === 0) {
  failures.push(
    "no trigger produced comparable ROWS (all were refusals or empty) — trigger equality alone " +
    "would pass while the decode path went entirely untested. Drive an unshielded workload.");
}

// (3b) Negative control: a differential that cannot fail proves nothing. Corrupt one archived
// transaction blob in a transaction, confirm the read detects it, then roll back.
let negativeControl = "not run";
const target = firedUmbra.map((f) => f.split("|")[1]!).find(Boolean);
if (target) {
  // The corruption must be COMMITTED: `UmbraRead` opens its own pool, so a change held in an
  // uncommitted transaction on another connection is invisible to it. (An earlier version of this
  // control did exactly that and reported "corruption went undetected" — the control catching a
  // bug in itself, which is the argument for having one.)
  const { rows: orig } = await pool.query<{ hash: Buffer; data: Buffer }>(
    `SELECT cb.hash, cb.data FROM ${SCHEMA}.chain_blobs cb
       JOIN ${SCHEMA}.transactions t ON t.raw_blob_hash = cb.hash
      WHERE t.tx_hash = decode($1,'hex') LIMIT 1`, [target]);
  const blob = orig[0];
  if (!blob) {
    failures.push(`negative control: could not load the raw blob for ${target}`);
  } else {
    try {
      // Flip one byte rather than appending, so the length is unchanged and ONLY the content hash
      // can betray it — a stricter test of the integrity check.
      const corrupted = Buffer.from(blob.data);
      corrupted[0] = corrupted[0]! ^ 0xff;
      await pool.query(`UPDATE ${SCHEMA}.chain_blobs SET data=$2 WHERE hash=$1`, [blob.hash, corrupted]);
      const probe = new UmbraRead({ databaseUrl: PG, schema: SCHEMA, net: NET, networkId: "undeployed", unsafeAllowIncompleteEffects: true });
      try {
        await probe.getUnshieldedCreates(target);
        negativeControl = "FAILED — corruption went undetected";
        failures.push("negative control: a corrupted archive blob was NOT detected on read");
      } catch (e) {
        negativeControl = `ok — detected (${String((e as Error).message).slice(0, 48)}…)`;
      } finally { await probe.close(); }
    } finally {
      // Always restore, and PROVE the restore worked — a control that leaves the archive corrupt
      // would poison every later run with a failure that looks like a real defect.
      await pool.query(`UPDATE ${SCHEMA}.chain_blobs SET data=$2 WHERE hash=$1`, [blob.hash, blob.data]);
      const verify = new UmbraRead({ databaseUrl: PG, schema: SCHEMA, net: NET, networkId: "undeployed", unsafeAllowIncompleteEffects: true });
      try { await verify.getUnshieldedCreates(target); }
      catch (e) { failures.push(`negative control: RESTORE FAILED for ${target} — archive left corrupt: ${(e as Error).message}`); }
      finally { await verify.close(); }
    }
  }
}
console.log(`[negative control] ${negativeControl}`);

await reader.close();
await (fu as any).close();
await (fi as any).close();
await pool.end();

console.log("");
if (failures.length === 0) {
  console.log(
    `PASS — triggers identical across ${heights.length} blocks (${firedIndexer.length} fired), ` +
    `${exact} read(s) row-exact over ${rowsCompared} row(s), ${typedRefusals} typed ClaimRewards refusal(s)`);
  process.exit(0);
}
console.error(`FAIL (${failures.length}):`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
