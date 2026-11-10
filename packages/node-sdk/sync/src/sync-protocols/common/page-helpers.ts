import type { Operation } from "effection";
import type { PageRange, PageRelation } from "../base/page.ts";
import type { PaginatedFetcher } from "../base/fetcher.ts";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";

// Fetch backpressure. See README "Backpressure (`maxBufferedPages`)".
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
    mergeWaitingForPage: boolean;
  },
  syncProtocol: { maxBufferedPages?: number; stepSize?: number },
): boolean {
  const cap = bufferCapFor(syncProtocol);
  // Exempt this chain from the cap while the merge is blocked on its page (pausing
  // there would deadlock — see SyncState.mergeWaitingForPage). Reporting
  // atCap=false while exempt is correct: the chain is genuinely not paused.
  const atCap = !state.mergeWaitingForPage && state.bufferedData.size() >= cap;
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

type PaginatedState<Page> = {
  lastPage: { readonly own: unknown } | undefined;
  fetcher: PaginatedFetcher<Page>;
  pageRelation: PageRelation<Page>;
};

export function* genInputRange<Page, SyncProtocol extends PaginatedState<Page>>(
  state: SyncProtocol,
  genesisPage: NoInfer<Page>,
  config: ConfigSubset<NoInfer<Page>>,
  namespace: string[],
): Operation<undefined | PageSyncRange<Page>> {
  const lastPage = state.lastPage?.own as Page | undefined;
  const nextPage = lastPage == null
    ? genesisPage
    : state.fetcher.nextInterval(lastPage).from;
  // TODO This will always be false as the genesis page is the startPage
  const isPresync = state.pageRelation.compare(nextPage, config.startPage) < 0;

  const maxPage = isPresync
    ? state.fetcher.previousInterval(config.startPage).to
    : yield* state.fetcher.getLatestPage(lastPage);
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
    from: nextPage,
    to: clampedMax,
    isPresync,
  };
}
