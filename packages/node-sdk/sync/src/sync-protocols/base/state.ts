import { type Operation, until } from "effection";
import Deque from "denque";
import {
  type BlockNumber,
  conditionVariable,
  type CondVar,
} from "@effectstream/utils";
import stableStringify from "json-stable-stringify";
import { bound } from "@effectstream/utils";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import type { BaseDataFetcher, DataFetched } from "./fetcher.ts";
import type { PageRelation } from "./page.ts";
import type { PoolClient } from "pg";
import { acquireDBMutex, releaseDBMutex, upsertPage } from "@effectstream/db";

export type LastPage<Page, RootPage> = {
  own: Page;
  ownBlockNumber: BlockNumber;
  root: RootPage;
};
/**
 * Since it's always possible for code to fail,
 * we avoid applying any modifications to data until AFTER the block is applied
 */
export type CacheCleanup = () => void;
export type OutputAndCleanup<Output> = {
  output: Output;
  cleanup: CacheCleanup;
};

export interface RootConversion<Output, RootOutput, RootPage> {
  toRootOutput: (data: Output) => RootOutput;
  toRootPage: (data: Output) => RootPage;
}

export type PageTypeOf<
  SyncProtocol extends SyncState<any, any, any, any, any, any>,
> = SyncProtocol extends SyncState<any, any, infer PageType, any, any, any>
  ? PageType
  : never;

export abstract class SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  Fetcher extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>,
> implements RootConversion<Output, RootOutput, RootPage> {
  public readonly bufferedData: Deque<OutputAndCleanup<Output>>;
  /**
   * Wakes up when new data is available\
   * Note: if a query returns no data, the `page` is updated,
   *       but this won't trigger this conditional variable.
   *       See {@link SyncState#newPageCondVar} if you need this.
   */
  public readonly newDataCondVar: CondVar<void>;
  /**
   * Wakes up when the `page` is available\
   * Note: this will trigger even if no new data is found.
   *       If you don't want this, see {@link SyncState#newDataCondVar} instead.
   */
  public readonly newPageCondVar: CondVar<void>;
  /**
   * Page is kept separately because a page is not necessarily the last input you've received
   * ex: it's possible that you query from timestamp [0,100] and get no data
   *     so you would set the lastPage at 100
   *     so you don't have to re-query [0,100] which you know is empty
   */
  public lastPage: undefined | LastPage<Page, RootPage>;
  /** Timestamp of the last successful fetch (readData completed without error). */
  public lastSuccessfulFetchMs: number = 0;
  /** Number of consecutive errors since the last successful fetch. */
  public consecutiveErrors: number = 0;
  /** Timestamp of the most recent error, or 0 if no error has occurred. */
  public lastErrorTimestamp: number = 0;

  // ── Backpressure observability (issue #1; see common/page-helpers.ts + README) ──
  /** Resolved fetch cap (`maxBufferedPages`); set on each backpressure check, 0 until the first. */
  public bufferCap: number = 0;
  /** Peak `bufferedData.size()` seen since boot — catches spikes the periodic sampler misses. */
  public bufferHighWater: number = 0;
  /** Whether fetching is currently paused because the buffer is at/over the cap. */
  public pausedNow: boolean = false;
  /** How many times the cap engaged (rising edges) — the "backpressure fired" counter. */
  public backpressurePauses: number = 0;
  /** Total time fetching has been paused by the cap, in ms. */
  public backpressurePausedMs: number = 0;
  /** Start of the current pause, for accumulating `backpressurePausedMs`. */
  private pauseStartMs: number = 0;

  constructor(
    public readonly name: string,
    lastPage: undefined | LastPage<Page, RootPage>,
    public readonly fetcher: Fetcher,
    public readonly pageRelation: PageRelation<Page>,
    public readonly dbConn: PoolClient | undefined = undefined,
  ) {
    this.bufferedData = new Deque();
    this.newDataCondVar = conditionVariable<void>();
    this.newPageCondVar = conditionVariable<void>();
    this.lastPage = lastPage;
  }

  abstract stateToInput(): Operation<undefined | Input>;
  abstract toPage(input: Input, data: Output[]): Page;
  abstract toRootPage(data: Output): RootPage;
  abstract toRootOutput(data: Output): RootOutput;
  abstract getNamespace(): string[];

  /**
   * Start any process that is meant to fetch data asynchronously
   * By default, this is a no-op, but other classes can override it
   */
  *startAsync(): Operation<void> {
  }

  /**
   * Stateless function that defines how to merge a single data point into the root
   */
  abstract mergeDatum(ourOutput: Output, rootOutput: RootOutput): void;

  recordBackpressure(atCap: boolean, cap: number): void {
    this.bufferCap = cap;
    const now = Date.now();
    if (atCap && !this.pausedNow) {
      this.pausedNow = true;
      this.pauseStartMs = now;
      this.backpressurePauses += 1;
    } else if (!atCap && this.pausedNow) {
      this.pausedNow = false;
      this.backpressurePausedMs += now - this.pauseStartMs;
    }
  }

  @bound
  *updateState(
    _input: Input,
    data: DataFetched<Output, Page, RootPage>,
  ): Operation<void> {
    if (data.output.length > 0) {
      for (const datum of data.output) {
        this.bufferedData.push(datum);
      }
      // Peak right after a push — the local max before the merge drains it.
      this.bufferHighWater = Math.max(this.bufferHighWater, this.bufferedData.size());
      this.newDataCondVar.wake();
    }

    if (stableStringify(data.lastPage) !== stableStringify(this.lastPage)) {
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        this.getNamespace(),
        SeverityNumber.DEBUG,
        (log) =>
          log(
            `Update root page: ${this.lastPage?.root} -> ${data.lastPage.root}`,
          ),
      );

      yield* acquireDBMutex(`update-state-${this.name}`);
      yield* until(upsertPage.run({
        protocol_name: this.name,
        page_number: data.lastPage.ownBlockNumber,
        page: JSON.stringify(data.lastPage),
      }, this.dbConn as any)); // Client,
      releaseDBMutex(`update-state-${this.name}`);
      this.lastPage = data.lastPage;
      this.newPageCondVar.wake();
    }
  }
}
