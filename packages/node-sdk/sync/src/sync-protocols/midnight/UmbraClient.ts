import pg from "pg";
import type { BlockFetchOptions, MidnightGqlBlockState } from "./MidnightClient.ts";

/**
 * Reads Midnight primitive data straight out of an UmbraDB chain archive, in place of the
 * Midnight indexer's GraphQL API.
 *
 * **Why this is a client and not a second fetcher.** `MidnightFetcher` is entirely a mapping from
 * one block-shaped structure to state-machine inputs; none of it is indexer-specific. Producing
 * the identical structure from SQL therefore migrates a primitive without touching the fetcher,
 * the sync state, or any primitive class -- which is also what preserves the property that
 * matters most here: the state machine keeps firing at exactly the same block heights, with
 * exactly the same payloads.
 *
 * **Scope: `Midnight:ZswapRoot` only, deliberately.** Every other Midnight primitive needs data
 * that is an output of stateful ledger replay (applied ledger events, per-segment success,
 * unshielded UTXO deltas), which the archive does not yet produce. Asking this client for one of
 * those throws at construction rather than returning empty results, because a silently empty feed
 * is indistinguishable from a quiet chain and would look like a working migration right up until
 * someone noticed the state machine had never fired.
 *
 * Read contract (UmbraDB migration `002_zswap_root`):
 *   - `feed_blocks_v1`     -- canonical blocks, height <= watermark, with `timestamp_ms`
 *   - `feed_zswap_roots_v1`-- one row per canonical block carrying a captured root AND at least
 *                             one regular transaction, attributed to that block's LAST regular
 *                             transaction
 * Both are versioned views, so the archive's physical layout can change behind them.
 */

/** Which primitive types this client can actually serve today. Everything else is replay-gated. */
const SUPPORTED_PRIMITIVE_TYPES: ReadonlySet<string> = new Set(["Midnight:ZswapRoot"]);

export interface UmbraClientOptions {
  /** Postgres connection string for the UmbraDB archive database. */
  databaseUrl: string;
  /** Archive schema (UmbraDB's default is `chain_archive`). */
  schema?: string;
  /** The archive's network label -- the `net` column every feed view is keyed by. Must match the
   *  value the archive was ingested under, or the feed is simply empty. */
  net: string;
}

/** Rejects anything that is not a plain SQL identifier before it reaches an interpolated schema
 *  name. `pg` cannot parameterize an identifier, so this is the boundary that keeps a config
 *  value out of the query text. */
function assertPlainIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(
      `UmbraClient: ${field} must be a plain SQL identifier (letters, digits, underscore; not ` +
        `starting with a digit), got ${JSON.stringify(value)}`,
    );
  }
}

export class UmbraClient {
  private readonly pool: pg.Pool;
  private readonly schema: string;
  private readonly net: string;

  constructor(options: UmbraClientOptions) {
    this.schema = options.schema ?? "chain_archive";
    this.net = options.net;
    assertPlainIdentifier(this.schema, "schema");
    this.pool = new pg.Pool({ connectionString: options.databaseUrl });
    console.log(
      `[UmbraClient] Reading archive ${this.schema} (net: ${this.net}) instead of an indexer`,
    );
  }

  /**
   * Fails fast when a configured primitive needs data this client cannot serve. Called once at
   * fetcher construction, so the process dies at startup with a named primitive rather than
   * running indefinitely against an empty feed.
   */
  static assertPrimitivesSupported(primitiveTypes: readonly string[]): void {
    const unsupported = [...new Set(primitiveTypes)].filter((t) => !SUPPORTED_PRIMITIVE_TYPES.has(t));
    if (unsupported.length === 0) return;
    throw new Error(
      `UmbraDB-backed Midnight sync cannot serve these primitives yet: ${unsupported.join(", ")}. ` +
        `Supported today: ${[...SUPPORTED_PRIMITIVE_TYPES].join(", ")}. The rest read data that ` +
        `only stateful ledger replay produces (applied ledger events, per-segment transaction ` +
        `success, unshielded UTXO deltas), which the archive does not project yet -- keep those ` +
        `primitives on an indexer-backed sync protocol entry until it does.`,
    );
  }

  /**
   * The archive's own progress, which is what bounds this feed. Deliberately the highest block
   * PRESENT IN THE FEED rather than the node's tip: the sync engine must never be handed a height
   * the archive has not finished writing, or it would page past real data and never come back.
   */
  async fetchLatestBlock(): Promise<{ block: { height: number } }> {
    const { rows } = await this.pool.query<{ height: string | null }>(
      `SELECT max(height)::text AS height FROM ${this.schema}.feed_blocks_v1 WHERE net = $1`,
      [this.net],
    );
    const height = rows[0]?.height;
    if (height == null) {
      throw new Error(
        `UmbraClient: the archive has no canonical blocks for net ${JSON.stringify(this.net)} in ` +
          `${this.schema}.feed_blocks_v1. Check that the archive has been ingested and that the ` +
          `configured net matches the one it was ingested under.`,
      );
    }
    return { block: { height: Number(height) } };
  }

  /**
   * One block, shaped exactly as the indexer's GraphQL would return it.
   *
   * A block with no zswap root contributes an empty `transactions` array rather than a missing
   * block: the fetcher relies on every requested height coming back so it can advance its page,
   * and the ZswapRoot primitive already emits nothing for a block whose transactions carry no
   * root. That keeps "the archive has this block, nothing happened in it" distinct from "the
   * archive does not have this block", which is an error.
   */
  async fetchBlock(
    blockHeight: number,
    _options: BlockFetchOptions = {},
    _signal?: AbortSignal,
  ): Promise<MidnightGqlBlockState> {
    const { rows: blockRows } = await this.pool.query<{
      hash: string;
      height: string;
      parent_hash: string;
      timestamp_ms: string | null;
      protocol_version: number | null;
    }>(
      `SELECT block_hash AS hash, height::text AS height, parent_hash, timestamp_ms::text,
              protocol_version
         FROM ${this.schema}.feed_blocks_v1
        WHERE net = $1 AND height = $2`,
      [this.net, blockHeight],
    );
    const block = blockRows[0];
    if (!block) {
      throw new Error(
        `UmbraClient: no canonical block at height ${blockHeight} for net ` +
          `${JSON.stringify(this.net)}. The archive's watermark should have prevented this ` +
          `height from being requested at all, so this means the archive was rolled back or the ` +
          `feed was read past its own tip.`,
      );
    }
    if (block.timestamp_ms == null) {
      // The sync engine places every block on the root chain's clock from this value. A block
      // ingested before the timestamp column existed would otherwise silently become NaN and
      // corrupt page ordering, so refuse it by name instead.
      throw new Error(
        `UmbraClient: block ${blockHeight} has no timestamp_ms. It was ingested before UmbraDB ` +
          `migration 002_zswap_root added the column; re-ingest that range before reading it.`,
      );
    }

    const { rows: rootRows } = await this.pool.query<{ root: string; tx_hash: string }>(
      `SELECT root, tx_hash FROM ${this.schema}.feed_zswap_roots_v1
        WHERE net = $1 AND block_height = $2`,
      [this.net, blockHeight],
    );

    // At most one row per block by construction (the view picks the block's last regular
    // transaction), so this is a presence check, not a reduction.
    const transactions = rootRows.map((r) => ({
      hash: r.tx_hash,
      contractActions: [],
      zswapMerkleTreeRoot: r.root,
    }));

    return {
      block: {
        hash: block.hash,
        height: Number(block.height),
        protocolVersion: block.protocol_version ?? 0,
        timestamp: Number(block.timestamp_ms),
        parent: { hash: block.parent_hash },
        transactions,
      },
    } as MidnightGqlBlockState;
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
