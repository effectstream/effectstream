import type { BlockFetchOptions, MidnightGqlBlockState } from "./MidnightClient.ts";

/**
 * The block source a Midnight sync protocol reads from.
 *
 * Extracted so a protocol can be driven by something other than the Midnight indexer — today the
 * indexer's GraphQL (`MidnightClient`) or an UmbraDB chain archive over Postgres (`UmbraClient`).
 *
 * **Why an interface rather than "just construct a different client".** `MidnightFetcher.client`
 * and `MidnightSyncState.client` were typed against the concrete `MidnightClient`, so swapping the
 * source is *not* the zero-diff change it was previously described as. Everything downstream of
 * this seam genuinely is unchanged, though: `MidnightFetcher` is a pure mapping from a block-shaped
 * structure to state-machine inputs, so a source returning the same shape leaves the fetcher's
 * primitive logic, the sync state's paging, and **every primitive class** untouched. That is what
 * preserves the property the whole migration rests on — the state machine keeps firing at the same
 * heights with the same payloads.
 *
 * Structural on purpose: implementations do not `implements` this type, they merely satisfy it, so
 * neither client has to import the other's module.
 */
export interface MidnightBlockClient {
  /**
   * The highest block this source can currently serve.
   *
   * For the indexer this is the chain tip it has reached; for an archive it is the archive's own
   * watermark, which is deliberately *not* the chain tip — handing the sync engine a height the
   * source has not finished writing would let it page past real data and never return.
   */
  fetchLatestBlock(): Promise<{ block: { height: number } }>;

  /**
   * One block, in the shape `MidnightFetcher` consumes.
   *
   * A block that exists but contains nothing of interest must return successfully with an empty
   * `transactions` array — the fetcher relies on every requested height coming back so it can
   * advance its page. Only a block the source genuinely cannot serve is an error, and it must be
   * raised as one rather than returned as an empty result: an empty result is indistinguishable
   * from a quiet chain.
   */
  fetchBlock(
    blockHeight: number,
    options?: BlockFetchOptions,
    signal?: AbortSignal,
  ): Promise<MidnightGqlBlockState>;

  /**
   * Release any resources held by the source (e.g. a Postgres pool). Optional because the
   * indexer-backed client holds none; a source that does hold them must implement it, or a test
   * process will hang on teardown with no indication why.
   */
  close?(): Promise<void>;
}
