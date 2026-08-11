import pg from "pg";
import { createHash } from "node:crypto";
import type { BlockFetchOptions, MidnightGqlBlockState } from "./MidnightClient.ts";
import type { MidnightBlockClient } from "./block-client.ts";
import { decodeUnshieldedCreates } from "./unshielded-decoder.ts";
import {
  decodeBlockTimestampMs,
  decodeProtocolVersionFromDigestLogs,
  isSupportedProtocolVersion,
  parseBodyBlob,
  parseHeaderBlob,
} from "./archive-header-decoder.ts";

/**
 * Reads Midnight primitive data out of an **unmodified** UmbraDB chain archive, over Postgres, in
 * place of the Midnight indexer's GraphQL API.
 *
 * **The integration boundary is the database.** Nothing here imports UmbraDB code: its package
 * ships only `dist` and excludes `chain-archive-sync` from its build, and more importantly the
 * whole point is that a reviewer needs a stock archive and a connection string — not a branch, a
 * migration, or a patched dependency. Transaction decoding is a Midnight-ledger concern
 * effectstream already handles in two existing decoders.
 *
 * **Scope: `Midnight:UnshieldedCreate` only.** Every other Midnight primitive needs data that only
 * stateful ledger replay produces (applied ledger events with `mtIndex`, per-segment success).
 * Asking this client for one throws at construction naming every unsupported primitive, because a
 * silently empty feed is indistinguishable from a quiet chain and would look like a working
 * migration right up until someone noticed the state machine had never fired.
 */

const SUPPORTED_PRIMITIVE_TYPES: ReadonlySet<string> = new Set(["Midnight:UnshieldedCreate"]);

export interface UmbraClientOptions {
  /** Postgres connection string for the UmbraDB archive database. */
  databaseUrl: string;
  /** Archive schema; UmbraDB's own default is `chain_archive`. */
  schema?: string;
  /** The archive's network label — the `net` every row is keyed by. Must match what the archive was
   *  ingested under, or the feed is simply empty. */
  net: string;
  /** Network id used to render owner addresses as Bech32m (`undeployed`, `testnet`, …). */
  networkId: string;
  /**
   * Proceed on transactions whose applied result the archive does not record.
   *
   * Stock UmbraDB **never populates `transactions.result`** (verified: every row NULL), so without
   * this the reader refuses every transaction and emits nothing, forever. It waives only the
   * *unknown* case — a result positively recorded as `failure`/`partial_success` is still refused.
   * Set by the config's `unsafeAllowIncompleteEffects`; delete both, do not rename, once the
   * archive populates `result` (plan dependency B3).
   */
  unsafeAllowIncompleteEffects?: boolean;
}

/** Rejects anything that is not a plain SQL identifier before it reaches an interpolated schema
 *  name. `pg` cannot parameterize an identifier, so this is the boundary keeping a config value out
 *  of the query text. */
function assertPlainIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(
      `UmbraClient: ${field} must be a plain SQL identifier (letters, digits, underscore; not ` +
        `starting with a digit), got ${JSON.stringify(value)}`,
    );
  }
}

export class UmbraClient implements MidnightBlockClient {
  private readonly pool: pg.Pool;
  private readonly schema: string;
  private readonly net: string;
  private readonly networkId: string;
  private readonly allowIncomplete: boolean;

  constructor(options: UmbraClientOptions) {
    this.schema = options.schema ?? "chain_archive";
    assertPlainIdentifier(this.schema, "schema");
    this.net = options.net;
    this.networkId = options.networkId;
    this.allowIncomplete = options.unsafeAllowIncompleteEffects === true;
    this.pool = new pg.Pool({ connectionString: options.databaseUrl });
    console.log(
      `[UmbraClient] Reading archive ${this.schema} (net: ${this.net}) instead of an indexer` +
        (this.allowIncomplete ? " [unsafeAllowIncompleteEffects]" : ""),
    );
  }

  /** Fails fast when a configured primitive needs data this client cannot serve — at construction,
   *  so the process dies at startup naming the primitive rather than running against an empty feed. */
  static assertPrimitivesSupported(primitiveTypes: readonly string[]): void {
    const unsupported = [...new Set(primitiveTypes)].filter((t) => !SUPPORTED_PRIMITIVE_TYPES.has(t));
    if (unsupported.length === 0) return;
    throw new Error(
      `UmbraDB-backed Midnight sync cannot serve these primitives yet: ${unsupported.join(", ")}. ` +
        `Supported today: ${[...SUPPORTED_PRIMITIVE_TYPES].join(", ")}. The rest read data that ` +
        `only stateful ledger replay produces (applied ledger events, per-segment transaction ` +
        `success), which the archive does not project — keep those primitives on an indexer-backed ` +
        `sync-protocol entry until it does.`,
    );
  }

  /**
   * The archive's own watermark — deliberately NOT the chain tip. Handing the sync engine a height
   * the archive has not finished writing would let it page past real data and never come back.
   *
   * Stock UmbraDB writes `watermarks(kind='chain_archive', key='sync_cursor:<net>')` with a JSONB
   * `{"height": N}`. A missing or malformed row is an error, never a silent zero.
   */
  async fetchLatestBlock(): Promise<{ block: { height: number } }> {
    const { rows } = await this.pool.query<{ value: unknown }>(
      `SELECT value FROM ${this.schema}.watermarks WHERE kind = 'chain_archive' AND key = $1`,
      [`sync_cursor:${this.net}`],
    );
    const value = rows[0]?.value as { height?: unknown } | undefined;
    if (value === undefined) {
      throw new Error(
        `UmbraClient: no sync watermark for net ${JSON.stringify(this.net)} in ` +
          `${this.schema}.watermarks. The archive has not ingested this network, or the configured ` +
          `net does not match the one it was ingested under.`,
      );
    }
    const height = Number(value.height);
    if (!Number.isSafeInteger(height) || height < 0) {
      throw new Error(
        `UmbraClient: malformed watermark for net ${JSON.stringify(this.net)}: ` +
          `${JSON.stringify(value)}. Refusing to guess a height.`,
      );
    }
    return { block: { height } };
  }

  /**
   * One block, in the shape `MidnightFetcher` consumes.
   *
   * A canonical block with nothing of interest returns successfully with an empty `transactions`
   * array — the fetcher needs every requested height back so it can advance its page. Only a block
   * the archive genuinely cannot serve is an error.
   */
  async fetchBlock(
    blockHeight: number,
    _options: BlockFetchOptions = {},
    _signal?: AbortSignal,
  ): Promise<MidnightGqlBlockState> {
    // Canonical only: `blocks` models the whole block tree, including competing blocks at one
    // height, and a state machine must never observe one that later turns out to be off-chain.
    const { rows: blockRows } = await this.pool.query<{
      block_hash: string; height: string; parent_hash: string;
      header: Buffer; header_hash: string; body: Buffer | null; body_hash: string | null;
    }>(
      `SELECT encode(b.block_hash,'hex')  AS block_hash,
              b.height::text              AS height,
              encode(b.parent_hash,'hex') AS parent_hash,
              hb.data                     AS header,
              encode(b.header_blob_hash,'hex') AS header_hash,
              bb.data                     AS body,
              encode(b.body_blob_hash,'hex')   AS body_hash
         FROM ${this.schema}.blocks b
         JOIN ${this.schema}.chain_blobs hb ON hb.hash = b.header_blob_hash
    LEFT JOIN ${this.schema}.chain_blobs bb ON bb.hash = b.body_blob_hash
        WHERE b.net = $1 AND b.height = $2 AND b.is_canonical`,
      [this.net, blockHeight],
    );
    if (blockRows.length === 0) {
      throw new Error(
        `UmbraClient: no canonical block at height ${blockHeight} for net ` +
          `${JSON.stringify(this.net)}. The watermark should have prevented this height being ` +
          `requested, so the archive was rolled back or read past its own tip.`,
      );
    }
    if (blockRows.length > 1) {
      // `blocks_one_canonical_per_height` makes this impossible in a healthy archive; if it ever
      // happens, guessing which row is right is exactly the wrong response.
      throw new Error(
        `UmbraClient: ${blockRows.length} canonical blocks at height ${blockHeight} for net ` +
          `${JSON.stringify(this.net)} — the archive violates one-canonical-per-height.`,
      );
    }
    const block = blockRows[0]!;

    // Content-addressed storage is only worth having if reads verify it.
    this.verifyBlob(block.header, block.header_hash, `header of block ${blockHeight}`);
    if (block.body !== null && block.body_hash !== null) {
      this.verifyBlob(block.body, block.body_hash, `body of block ${blockHeight}`);
    }

    const { digestLogs } = parseHeaderBlob(block.header);
    const protocolVersion = decodeProtocolVersionFromDigestLogs(digestLogs);
    if (protocolVersion === undefined) {
      throw new Error(
        `UmbraClient: block ${blockHeight} carries no MNSV protocol-version digest. Refusing to ` +
          `decode its transactions with an assumed ledger version.`,
      );
    }
    if (!isSupportedProtocolVersion(protocolVersion)) {
      throw new Error(
        `UmbraClient: block ${blockHeight} has unsupported protocol version ${protocolVersion}. ` +
          `This reader is wired for one ledger codec; decoding an unknown version would either ` +
          `produce garbage that still parses or fail opaquely.`,
      );
    }

    const timestamp = block.body === null
      ? undefined
      : decodeBlockTimestampMs(parseBodyBlob(block.body), protocolVersion);
    if (timestamp === undefined) {
      // The sync engine places every block on the root chain's clock from this; a NaN here would
      // silently corrupt page ordering.
      throw new Error(
        `UmbraClient: block ${blockHeight} has no decodable Timestamp::set inherent` +
          `${block.body === null ? " (no body blob archived)" : ""}.`,
      );
    }

    // Transactions of THIS block: joined on the exact (net, height, block_hash) triple so a
    // competing fork's rows can never leak in, and ordered by the archive's own position.
    const { rows: txRows } = await this.pool.query<{
      tx_hash: string; position: number; kind: string; result: string | null; raw: Buffer; raw_hash: string;
    }>(
      `SELECT encode(t.tx_hash,'hex') AS tx_hash, t.position, t.kind, t.result,
              cb.data AS raw, encode(t.raw_blob_hash,'hex') AS raw_hash
         FROM ${this.schema}.transactions t
         JOIN ${this.schema}.chain_blobs cb ON cb.hash = t.raw_blob_hash
        WHERE t.net = $1 AND t.block_height = $2 AND t.block_hash = decode($3,'hex')
        ORDER BY t.position`,
      [this.net, blockHeight, block.block_hash],
    );

    const transactions = txRows.map((t) => {
      this.verifyBlob(t.raw, t.raw_hash, `transaction ${t.tx_hash}`);
      // System transactions carry no unshielded offers this reader can decode; they contribute a
      // transaction row with no creates rather than being dropped.
      let created: MidnightGqlBlockState["block"]["transactions"][number]["unshieldedCreatedOutputs"] = [];
      let refused: string | undefined;
      if (t.kind === "regular") {
        const outcome = decodeUnshieldedCreates(
          Uint8Array.from(t.raw), t.result ?? undefined, this.networkId, t.tx_hash,
          { unsafeTreatUnknownResultAsSuccess: this.allowIncomplete },
        );
        if (!outcome.ok) {
          // A refusal is NOT a halt and NOT a silent skip: it marks the transaction so the
          // primitive still fires a trigger for it, and the CONSUMER (which reads the rows on
          // demand) sees the same refusal and decides. This is what keeps the trigger set
          // identical to the indexer's even at ClaimRewards heights, without the sync layer
          // pretending it can derive rows it cannot.
          refused = outcome.refusal.reason;
        } else {
          created = outcome.outputs;
        }
      }
      return {
        hash: t.tx_hash,
        contractActions: [],
        unshieldedCreatedOutputs: created,
        ...(refused !== undefined ? { umbraDecodeRefused: refused } : {}),
      };
    });

    return {
      block: {
        hash: block.block_hash,
        height: Number(block.height),
        protocolVersion,
        timestamp,
        parent: { hash: block.parent_hash },
        transactions,
      },
    } as MidnightGqlBlockState;
  }

  private verifyBlob(data: Buffer, expectedHashHex: string, what: string): void {
    const actual = createHash("sha256").update(data).digest("hex");
    if (actual !== expectedHashHex) {
      throw new Error(
        `UmbraClient: blob integrity failure for ${what}: stored under ${expectedHashHex}, ` +
          `content hashes to ${actual}.`,
      );
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
