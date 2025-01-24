import type { Operation } from "effection";
import type { PageRange } from "../base/page.ts";
import { narrowResult } from "@paima/utils";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import type { AllSyncProtocols } from "../types.ts";
import type { PageTypeOf } from "../base/state.ts";

type ConfigSubset<Page> = {
  name: string;
  /**
   * inclusive
   */
  startPage: Page;
};

export type PageSyncRange<Page> = PageRange<Page> & { isPresync: boolean };

export function* genInputRange<SyncProtocol extends AllSyncProtocols>(
  state: AllSyncProtocols,
  genesisPage: PageTypeOf<SyncProtocol>,
  config: ConfigSubset<PageTypeOf<SyncProtocol>>,
  namespace: string[],
): Operation<undefined | PageSyncRange<PageTypeOf<SyncProtocol>>> {
  const nextPage = state.lastPage == null
    ? genesisPage
    : state.fetcher.nextInterval(state.lastPage.own).from;
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
    ComponentNames.PAIMA_SYNC,
    namespace,
    SeverityNumber.INFO,
    (log) => log(pageRange),
  );
  return {
    from: narrowResult<
      PageTypeOf<AllSyncProtocols>,
      PageTypeOf<AllSyncProtocols>,
      PageTypeOf<SyncProtocol>
    >(nextPage),
    to: narrowResult<
      PageTypeOf<AllSyncProtocols>,
      PageTypeOf<AllSyncProtocols>,
      PageTypeOf<SyncProtocol>
    >(clampedMax),
    isPresync,
  };
}
