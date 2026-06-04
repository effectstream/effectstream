import type { Operation } from "effection";
import type { PageRange } from "../base/page.ts";
import { narrowResult } from "@effectstream/utils";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import type { PaginatedSyncProtocols } from "../types.ts";
import type { PageTypeOf } from "../base/state.ts";

// Fetch backpressure (issue #1). See README "Backpressure (`maxBufferedPages`)".
const MAX_BUFFER_MULTIPLE = 4;
// Fallback chunk size for chains that fetch without an explicit stepSize
// (e.g. utxorpc streams one block per pass).
const DEFAULT_STEP_SIZE = 1000;

/** Resolved fetch-backpressure cap for a chain. See README "Backpressure". */
export function bufferCapFor(
  syncProtocol: { maxBufferedPages?: number; stepSize?: number },
): number {
  const step = syncProtocol.stepSize ?? DEFAULT_STEP_SIZE;
  return Math.max(
    syncProtocol.maxBufferedPages ?? MAX_BUFFER_MULTIPLE * step,
    step + 1,
  );
}

/**
 * Whether a chain should pause fetching because its in-memory buffer is at/over
 * the cap. Each chain's `stateToInput` calls this first and returns `undefined`
 * when true, so the fetch loop sleeps + retries while the merge drains. Also
 * records backpressure metrics on `state` (for `/debug/metrics`).
 * See README "Backpressure (`maxBufferedPages`)".
 */
export function bufferAtCap(
  state: {
    bufferedData: { size(): number };
    recordBackpressure(atCap: boolean, cap: number): void;
  },
  syncProtocol: { maxBufferedPages?: number; stepSize?: number },
): boolean {
  const cap = bufferCapFor(syncProtocol);
  const atCap = state.bufferedData.size() >= cap;
  state.recordBackpressure(atCap, cap);
  return atCap;
}

type ConfigSubset<Page> = {
  name: string;
  /**
   * inclusive
   */
  startPage: Page;
};

export type PageSyncRange<Page> = PageRange<Page> & { isPresync: boolean };

export function* genInputRange<SyncProtocol extends PaginatedSyncProtocols>(
  state: SyncProtocol,
  genesisPage: PageTypeOf<SyncProtocol>,
  config: ConfigSubset<PageTypeOf<SyncProtocol>>,
  namespace: string[],
): Operation<undefined | PageSyncRange<PageTypeOf<SyncProtocol>>> {
  const nextPage = state.lastPage == null
    ? genesisPage
    : state.fetcher.nextInterval(state.lastPage.own).from;
  // TODO This will always be false as the genesis page is the startPage
  const isPresync = state.pageRelation.compare(nextPage, config.startPage) < 0;

  const maxPage = isPresync
    ? state.fetcher.previousInterval(config.startPage).to
    : yield* state.fetcher.getLatestPage(state.lastPage?.own);
  const clampedMax = state.pageRelation.min(
    maxPage,
    state.fetcher.intervalFromStart(nextPage).to,
  );
  // this can happen if the genesis is not the exact start of the system
  // and (esp. on local networks) the system hasn't reached the genesis page yet
  if (state.pageRelation.compare(nextPage, clampedMax) > 0) {
    return undefined;
  }

  const pageRange = state.pageRelation.equals(clampedMax, nextPage)
    ? `[${nextPage}]`
    : `[${nextPage}, ${clampedMax}]`;
  log.remote(
    ComponentNames.EFFECTSTREAM_SYNC,
    namespace,
    SeverityNumber.INFO,
    (log) => log(pageRange),
  );
  return {
    from: narrowResult<
      PageTypeOf<PaginatedSyncProtocols>,
      PageTypeOf<PaginatedSyncProtocols>,
      PageTypeOf<SyncProtocol>
    >(nextPage),
    to: narrowResult<
      PageTypeOf<PaginatedSyncProtocols>,
      PageTypeOf<PaginatedSyncProtocols>,
      PageTypeOf<SyncProtocol>
    >(clampedMax),
    isPresync,
  };
}
