import { call, type Operation } from "effection";
import { bound } from "@effectstream/utils";
import type { PoolClient } from "pg";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Input, Output, Page, SolanaLastPage, SolanaSyncMode } from "./types.ts";
import { toMsTimestamp } from "./types.ts";
import { assertResumeMarkerMatchesMode } from "./program-mode.ts";
import { blockNumberRelation } from "../common/utils.ts";
import type { SolanaFetcher } from "./fetcher.ts";
import type {
  ConfigNetworkType,
  SyncProtocolWithNetwork,
} from "@effectstream/config";
import { getPage } from "@effectstream/db";
import type { SolanaClient } from "./SolanaClient.ts";
import { applyDelay } from "../common/utils.ts";
import { bufferAtCap } from "../common/page-helpers.ts";

export class SolanaSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  SolanaFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage> | undefined,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.SOLANA }
    >,
    fetcher: SolanaFetcher,
    public readonly client: SolanaClient,
    dbConn: PoolClient,
  ) {
    super(
      config.syncProtocol.name,
      lastPage,
      fetcher,
      blockNumberRelation,
      dbConn,
    );
    // Each mode refuses the other mode's resume marker (AA 00064 C5, FR-007).
    assertResumeMarkerMatchesMode(fetcher.mode, config.syncProtocol.name, lastPage as SolanaLastPage | undefined);
    if (fetcher.programPoller != null) {
      const p = fetcher.programPoller;
      const cursor = (lastPage as SolanaLastPage | undefined)?.cursor;
      console.log(
        `[Solana] ${config.syncProtocol.name}: program mode, watching ${p.settings.programs.join(", ")} ` +
          `every ${config.syncProtocol.pollingInterval} ms from slot ${p.settings.startBlockHeight}; ` +
          (cursor ? `resuming after slot ${cursor.slot} (${cursor.signatures.length} signature(s) there).` : "no saved cursor."),
      );
    }
  }

  /** `block` (every slot via `getBlock`) or `program` (only the watched programs' transactions). */
  get mode(): SolanaSyncMode {
    return this.fetcher.mode;
  }

  @bound
  override toPage(_input: Input, data: Output[]): Page {
    const lastBlock = data[data.length - 1];
    return lastBlock.slot as Page;
  }

  @bound
  override toRootPage(data: Output): RootPage {
    // Solana blockTime is monotonically non-decreasing (enforced by the
    // cluster) — exactly what the merge gate needs: it pulls buffered parallel
    // outputs in slot order while their root timestamp is <= the main chain's,
    // so it disambiguates duplicate blockTimes by buffer/slot order, NOT by
    // this value. We therefore must NOT add a slot-derived offset: the previous
    // `(slot % 1000) * 0.001` was unnecessary AND broke monotonicity (it wrapped
    // every 1000 slots, so slot 1000's root could sort before slot 999's).
    return applyDelay(
      toMsTimestamp(data.blockTime),
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override toRootOutput(_data: Output): RootOutput {
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    if (this.fetcher.programPoller != null) return this.programPollDue();
    // Pause fetching while the merge drains our buffer (CLAUDE.md finding #1).
    // Every other protocol gates on this first; skipping it lets the Deque grow
    // toward the whole backlog during catch-up.
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    // Query the chain tip directly (like NearSyncState) rather than via
    // genInputRange, which requires the fetcher to implement PaginatedFetcher
    // (getLatestPage/nextInterval/...) — SolanaFetcher does not.
    const latestSlot = yield* call(() => this.client.getSlot());
    const finalizedSlot = latestSlot - this.config.syncProtocol.confirmationDepth;

    const lastSlot = this.lastPage?.own
      ?? ((this.config.syncProtocol.startBlockHeight as Page) - 1);

    if (lastSlot >= finalizedSlot) {
      return undefined;
    }

    const from = (lastSlot + 1) as Page;
    const to = Math.min(
      Number(lastSlot) + this.config.syncProtocol.stepSize,
      finalizedSlot,
    ) as Page;

    return {
      from,
      to,
      isPresync: false,
    };
  }

  /**
   * Program mode (AA 00064 C2): no RPC call here, all of a poll's calls run in
   * `readData`. Returns `undefined` (so the fetch loop sleeps the full
   * `pollingInterval`) after every completed poll and while the buffer is at
   * its cap; otherwise a poll is due. One poll per interval, always: never the
   * back-to-back loop block mode runs at the tip (R4).
   *
   * The cap is block mode's (`maxBufferedPages`, else derived from
   * `stepSize`); it counts outputs, which in program mode are slots holding a
   * watched transaction.
   */
  private programPollDue(): Input | undefined {
    const justPolled = this.fetcher.takePollCompleted();
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    if (justPolled) return undefined;
    const from = ((this.lastPage?.own ?? (this.config.syncProtocol.startBlockHeight - 1)) + 1) as Page;
    // The page travels with the input: the fetch loop calls readData(input, state)
    // without its lastPage argument (P4.4).
    return { from, to: from, isPresync: false, programPoll: true, lastPage: this.lastPage as SolanaLastPage | undefined };
  }

  @bound
  override mergeDatum(ourOutput: Output, rootOutput: RootOutput): void {
    const primitives = ourOutput.primitives.map((p) => ({
      ...p,
      source: this.config.syncProtocol.name,
    }));
    const blockInfo = [{
      protocol_name: this.config.syncProtocol.name,
      block_number: ourOutput.slot,
      blockHash: ourOutput.blockhash,
    }];
    rootOutput.blockInfo.push(...blockInfo);
    rootOutput.primitives.push(...primitives);
  }

  /**
   * Resume marker for a single slot. `Page` is a flat slot number, so `own` and
   * `ownBlockNumber` are the same value (cf. EvmSyncState). Declared `abstract`
   * on SyncState and called unconditionally by the merge for every protocol that
   * contributes data to a block — see CLAUDE.md design idea #5.
   */
  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    const page: SolanaLastPage = {
      own: data.slot as Page,
      ownBlockNumber: data.slot as Page,
      root: this.toRootPage(data),
    };
    // Program mode: the cursor rides in the marker the runtime persists with
    // the block, so a restart resumes exactly after the last committed
    // transaction (AA 00064 C5, FR-004).
    if (data.cursor != null) page.cursor = data.cursor;
    return page;
  }

  /**
   * `/health` (AA 00064 C9, spec FR-006): the mode and the RPC requests per
   * method since start, in both modes; program mode adds its interval,
   * progress, cursor and poll counts.
   */
  override healthDetails(): Record<string, unknown> {
    const rpc = this.fetcher.client.counters.snapshot();
    const details: Record<string, unknown> = {
      mode: this.mode,
      rpcCalls: rpc.calls,
      rpcCallsTotal: rpc.total,
      rpcRateLimited: rpc.rateLimited,
      rpcFailed: rpc.failed,
    };
    const p = this.fetcher.programPoller;
    if (p == null) return details;
    return {
      ...details,
      pollIntervalMs: this.pollingIntervalMs || this.config.syncProtocol.pollingInterval,
      programs: p.settings.programs,
      polls: p.polls,
      idlePolls: p.idlePolls,
      failedPolls: p.failedPolls,
      transactions: p.transactionsEmitted,
      lateSignatures: p.lateSignatures,
      indexFallbacks: p.indexFallbacks,
      progress: p.progress,
      cursor: p.cursor ?? (this.lastPage as SolanaLastPage | undefined)?.cursor ?? null,
    };
  }

  @bound
  override getNamespace(): string[] {
    return [this.config.network.name, this.config.syncProtocol.name];
  }

  static *restoreState(
    dbConn: PoolClient,
    config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.SOLANA }
    >,
    fetcher: SolanaFetcher,
  ): Operation<SolanaSyncState> {
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    // The fetcher's client, so block mode's getSlot and getBlock share one set
    // of call counters (C9).
    return new SolanaSyncState(
      page,
      config,
      fetcher,
      fetcher.client,
      dbConn,
    );
  }
}
