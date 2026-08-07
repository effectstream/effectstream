/**
 * Phase 1 acceptance test: `Midnight:ZswapRoot` read from UmbraDB must produce EXACTLY the
 * state-machine inputs the indexer-backed path produces, at exactly the same block heights.
 *
 * This drives the real production code on both sides -- two `MidnightFetcher` instances, one
 * constructed with a `MidnightClient` and one with an `UmbraClient`, both going through the same
 * `readPrimitives` mapping -- rather than comparing raw query results. What migrates is the
 * fetcher's output, so that is what is compared.
 *
 * Three properties are checked, and the second is the one that actually matters:
 *   1. VALUES  -- every emitted payload is byte-identical (root and txHash).
 *   2. TRIGGER -- the SET of heights that emit is identical. A migration that got the values
 *                 right but fired on different blocks would silently change when a state machine
 *                 advances, which is the invariant this whole migration is organized around.
 *   3. ORDER   -- the emitted sequence matches, not just the set.
 *
 * Usage (against a running devnet + an ingested archive):
 *   MIDNIGHT_INDEXER_HTTP=http://127.0.0.1:19088/api/v3/graphql \
 *   UMBRA_PG=postgres://umbra:umbra@127.0.0.1:15432/umbra \
 *   UMBRA_SCHEMA=chain_archive_zswap UMBRA_NET=undeployed \
 *   bun e2e/midnight-umbra/zswap-root-differential.ts
 */
import { run } from "effection";
import { MidnightFetcher } from "@effectstream/sync";
import pg from "pg";

const INDEXER = process.env.MIDNIGHT_INDEXER_HTTP ?? "http://127.0.0.1:19088/api/v3/graphql";
const UMBRA_PG = process.env.UMBRA_PG ?? "postgres://umbra:umbra@127.0.0.1:15432/umbra";
const UMBRA_SCHEMA = process.env.UMBRA_SCHEMA ?? "chain_archive_zswap";
const UMBRA_NET = process.env.UMBRA_NET ?? "undeployed";

const PRIMITIVE = {
  syncProtocol: "parallelMidnight",
  primitive: {
    name: "Midnight-ZswapRoot",
    type: "Midnight:ZswapRoot",
    startBlockHeight: 1,
    scheduledPrefix: "midnightZswapRootState",
  },
} as any;

function fetcherFor(source: "indexer" | "umbra"): MidnightFetcher {
  return new MidnightFetcher({
    syncProtocol: {
      name: `parallelMidnight_${source}`,
      type: "midnight-parallel",
      startBlockHeight: 1,
      pollingInterval: 1000,
      stepSize: 10,
      ...(source === "indexer"
        ? { indexer: INDEXER }
        : { umbra: { databaseUrl: UMBRA_PG, schema: UMBRA_SCHEMA, net: UMBRA_NET } }),
    },
    network: { name: "midnight", type: "midnight", networkId: "undeployed" },
    primitives: [PRIMITIVE],
  } as any);
}

/** The emitted state-machine payloads for one height, normalized for comparison. */
type Emission = { height: number; payloads: { root: string; txHash: string }[] };

async function emissionsFor(
  fetcher: MidnightFetcher,
  heights: number[],
): Promise<Map<number, Emission>> {
  const out = new Map<number, Emission>();
  for (const height of heights) {
    const block = await fetcher.client.fetchBlock(height, { zswapRoots: true });
    const primitives = await run(() =>
      fetcher.readPrimitives(height, block, [PRIMITIVE])
    );
    out.set(height, {
      height,
      payloads: primitives.map((p: any) => ({
        root: p.output.payload.root,
        txHash: p.output.payload.txHash,
      })),
    });
  }
  return out;
}

const pool = new pg.Pool({ connectionString: UMBRA_PG });
const { rows } = await pool.query<{ max: string | null }>(
  `SELECT max(height)::text AS max FROM ${UMBRA_SCHEMA}.feed_blocks_v1 WHERE net = $1`,
  [UMBRA_NET],
);
const archiveTip = Number(rows[0]?.max ?? 0);
await pool.end();

// Compare over the range the archive actually covers. Heights beyond it are not a disagreement,
// they are simply not ingested yet -- comparing them would measure ingest lag, not fidelity.
const heights = Array.from({ length: archiveTip + 1 }, (_, i) => i);
console.log(`Comparing heights 0..${archiveTip} (${heights.length} blocks)`);

const indexerFetcher = fetcherFor("indexer");
const umbraFetcher = fetcherFor("umbra");

const [fromIndexer, fromUmbra] = await Promise.all([
  emissionsFor(indexerFetcher, heights),
  emissionsFor(umbraFetcher, heights),
]);

const indexerFiring = heights.filter((h) => (fromIndexer.get(h)?.payloads.length ?? 0) > 0);
const umbraFiring = heights.filter((h) => (fromUmbra.get(h)?.payloads.length ?? 0) > 0);

console.log(`\n[trigger] indexer fires at ${indexerFiring.length} heights: ${indexerFiring.join(", ")}`);
console.log(`[trigger] umbra   fires at ${umbraFiring.length} heights: ${umbraFiring.join(", ")}`);

const failures: string[] = [];

// (2) TRIGGER equality -- symmetric difference must be empty.
const onlyIndexer = indexerFiring.filter((h) => !umbraFiring.includes(h));
const onlyUmbra = umbraFiring.filter((h) => !indexerFiring.includes(h));
if (onlyIndexer.length > 0) failures.push(`heights firing ONLY via indexer: ${onlyIndexer.join(", ")}`);
if (onlyUmbra.length > 0) failures.push(`heights firing ONLY via umbra: ${onlyUmbra.join(", ")}`);

// (1) VALUE equality, and (3) ORDER equality, per height.
for (const h of heights) {
  const a = fromIndexer.get(h)!.payloads;
  const b = fromUmbra.get(h)!.payloads;
  if (a.length !== b.length) {
    failures.push(`h=${h}: emitted ${a.length} via indexer vs ${b.length} via umbra`);
    continue;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.root !== b[i]!.root) {
      failures.push(`h=${h}[${i}]: root ${a[i]!.root} (indexer) != ${b[i]!.root} (umbra)`);
    }
    if (a[i]!.txHash !== b[i]!.txHash) {
      failures.push(`h=${h}[${i}]: txHash ${a[i]!.txHash} (indexer) != ${b[i]!.txHash} (umbra)`);
    }
  }
}

// A run where nothing fires -- or where only GENESIS fires -- would pass every check above while
// proving nothing. Genesis is identical on every chain and is present before any live ingest has
// happened, so a run whose only firing height is 0 would stay green even if ingest were entirely
// broken. Require at least one firing height above genesis, and treat its absence as a failure of
// the test rather than a success of the code.
const firingAboveGenesis = indexerFiring.filter((h) => h > 0);
if (firingAboveGenesis.length === 0) {
  failures.push(
    `the indexer path emitted a ZswapRoot at ${indexerFiring.length} height(s), none above ` +
      `genesis -- this corpus exercises no live ingest, so a match here is vacuous. Run ` +
      `drive-zswap-workload.ts against this chain, let the archive catch up, and re-run.`,
  );
}

console.log("");
if (failures.length === 0) {
  // Report whether the multi-transaction case was actually exercised. It is the one shape that
  // discriminates "attribute the root to the block's LAST regular transaction" from "there was
  // only one", and no chain here has produced it yet -- so say plainly when the run did not cover
  // it, rather than letting a green result imply more than it proves. (It is covered
  // deterministically in UmbraDB's own migration test.)
  const multiTx = [...fromIndexer.values()].filter((e) => e.payloads.length > 1).length;
  console.log(
    `PASS: ${indexerFiring.length} firing heights (${firingAboveGenesis.length} above genesis), ` +
      `identical trigger set, values and order over ${heights.length} blocks`,
  );
  console.log(
    multiTx > 0
      ? `      multi-rooted-transaction blocks exercised: ${multiTx}`
      : `      note: no block in this range carried >1 rooted transaction, so the ` +
        `"last regular transaction wins" rule was not discriminated by this run`,
  );
  process.exit(0);
}
console.error(`FAIL (${failures.length}):`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
