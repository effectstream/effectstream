import pg from "pg";
import { createHash } from "node:crypto";
import {
  decodeUnshieldedCreates,
  type UnshieldedDecodeOutcome,
} from "./unshielded-decoder.ts";

/**
 * The read side of the notify-don't-copy design (owner decision, 2026-08-09).
 *
 * The `Midnight:UnshieldedCreate` primitive delivers only `{ txHash }` to the state machine; the
 * created rows are NOT duplicated into STM inputs. A state-transition function that needs them
 * calls this client, which reads the transaction's raw bytes from the UmbraDB archive over SQL and
 * decodes them **at read time** — so exactly one copy of the data exists, in the archive.
 *
 * Same-machine Postgres is assumed. The decode is the same verified `decodeUnshieldedCreates` the
 * sync layer uses for trigger filtering, so what the consumer reads is exactly what the trigger
 * was fired for — including refusals: a transaction the decoder cannot fully derive (e.g.
 * `ClaimRewards`, whose UTXO requires ledger-internal reconstruction) comes back as a typed
 * refusal for the CONSUMER to decide on, instead of the sync layer halting or silently dropping.
 */
export interface UmbraReadOptions {
  databaseUrl: string;
  /** Archive schema; UmbraDB's default is `chain_archive`. */
  schema?: string;
  /** The archive's network label. */
  net: string;
  /** Network id for Bech32m owner rendering (`undeployed`, …). */
  networkId: string;
  /** Same waiver as the sync side — see `UnshieldedDecodeOptions`. Keep the two configured
   *  identically, or the trigger and the read will disagree about refusals. */
  unsafeAllowIncompleteEffects?: boolean;
}

export class UmbraRead {
  private readonly pool: pg.Pool;
  private readonly schema: string;

  constructor(private readonly options: UmbraReadOptions) {
    this.schema = options.schema ?? "chain_archive";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(this.schema)) {
      throw new Error(`UmbraRead: schema must be a plain SQL identifier, got ${JSON.stringify(this.schema)}`);
    }
    this.pool = new pg.Pool({ connectionString: options.databaseUrl });
  }

  /**
   * The unshielded UTXOs created by `txHash`, decoded from the archive's raw bytes at read time.
   *
   * Canonical rows only, and the blob is SHA-256-verified before decoding. A transaction hash not
   * present on the canonical chain is an error — never an empty result, which would be
   * indistinguishable from a transaction that created nothing.
   */
  async getUnshieldedCreates(txHash: string): Promise<UnshieldedDecodeOutcome> {
    const { rows } = await this.pool.query<{ raw: Buffer; raw_hash: string; result: string | null; kind: string }>(
      `SELECT cb.data AS raw, encode(t.raw_blob_hash,'hex') AS raw_hash, t.result, t.kind
         FROM ${this.schema}.transactions t
         JOIN ${this.schema}.blocks b
           ON b.net = t.net AND b.height = t.block_height AND b.block_hash = t.block_hash
         JOIN ${this.schema}.chain_blobs cb ON cb.hash = t.raw_blob_hash
        WHERE t.net = $1 AND t.tx_hash = decode($2,'hex') AND b.is_canonical`,
      [this.options.net, txHash],
    );
    if (rows.length === 0) {
      throw new Error(
        `UmbraRead: no canonical transaction ${txHash} for net ${JSON.stringify(this.options.net)}.`,
      );
    }
    const row = rows[0]!;
    const actual = createHash("sha256").update(row.raw).digest("hex");
    if (actual !== row.raw_hash) {
      throw new Error(
        `UmbraRead: blob integrity failure for transaction ${txHash}: stored under ${row.raw_hash}, ` +
          `content hashes to ${actual}.`,
      );
    }
    if (row.kind !== "regular") {
      return { ok: false, refusal: { reason: "undecodable", txHash, message: `kind=${row.kind}` } };
    }
    return decodeUnshieldedCreates(
      Uint8Array.from(row.raw),
      row.result ?? undefined,
      this.options.networkId,
      txHash,
      { unsafeTreatUnknownResultAsSuccess: this.options.unsafeAllowIncompleteEffects === true },
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
