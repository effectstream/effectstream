import type { Operation } from "effection";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import type {
  AllSyncProtocols,
  ISyncProtocol,
  RootOutput,
  RootPage,
} from "../types.ts";
import type { PageRelation } from "../base/page.ts";
import type Deque from "denque";
import type { ChainBlock } from "../common/root.ts";
import { chainPageRelation } from "../common/root.ts";
import type { CacheCleanup, OutputAndCleanup } from "../base/state.ts";

export function* startMerge(
  syncProtocols: AllSyncProtocols[],
): Operation<void> {
  while (true) {
    let newBlock: ChainBlock | undefined = undefined;

    const cleanup: CacheCleanup[] = [];

    for (let i = 0; i < syncProtocols.length; i++) {
      const mergeInfo: MergeResult<RootOutput> = yield* mergeIntoRoot(
        syncProtocols[i],
        {
          value: newBlock,
          toPage: (block) => block.timestamp,
          comparePage: chainPageRelation,
        },
      );
      cleanup.push(mergeInfo.updateCache);
      if (mergeInfo.newRoot != null) {
        newBlock = mergeInfo.newRoot;
      }
      if (i === 0) {
        log.remote(
          ComponentNames.PAIMA_SYNC,
          "block-merge",
          SeverityNumber.DEBUG,
          (log) => log(`new block ${mergeInfo.newRoot?.blockNumber}`),
        );
      }
    }
    log.remote(
      ComponentNames.PAIMA_SYNC,
      "block-merge",
      SeverityNumber.INFO,
      (log) => log(`finalizing block ${newBlock?.blockNumber}`),
    );

    // TODO: save data into a database (but not when using a localhost network that also started with Paima)
    for (const fn of cleanup) {
      fn();
    }
  }
}

export type MergeResult<RootOutput> = {
  updateCache: () => void;
  /**
   * undefined → replace whatever root might exist previously with this one.
   *             this is primarily useful for setting the initial root
   */
  newRoot: undefined | RootOutput;
};

/**
 * Merge as much of the data into the root as possible\
 * Note: it does *not* modify the child data.
 *       Instead, it returns a callback to remove elements that were merged.
 *       This is to help with error handling
 *       since you can avoid removing elements until you're sure no errors have happened
 *       given there is no way to recover these elements if an error happens after they get removed.
 *
 * @param value the data being constructed. `undefined` if this is the first piece of data in the chain
 */
export function* mergeIntoRoot<SyncProtocol extends AllSyncProtocols>(
  state: SyncProtocol,
  rootInfo: {
    value: undefined | RootOutput;
    toPage: (data: RootOutput) => RootPage;
    comparePage: PageRelation<RootPage>;
  },
): Operation<MergeResult<RootOutput>> {
  const iState = state as ISyncProtocol;

  // 1) If we've never made a single query yet, wait
  while (state.lastPage == null) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge blocked (first sync): waiting for page"),
    );
    yield* state.newPageCondVar.wait();
    log.remote(
      ComponentNames.PAIMA_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge unblocked (first sync): got page"),
    );
  }

  // 2) Handle case where this is the first in the list of states to merge data from
  if (rootInfo.value == null) {
    while (state.bufferedData.size() === 0) {
      log.remote(
        ComponentNames.PAIMA_SYNC,
        state.getNamespace(),
        SeverityNumber.DEBUG,
        (log) => log("Merge blocked (missing main data): waiting for data"),
      );
      yield* state.newDataCondVar.wait();
      log.remote(
        ComponentNames.PAIMA_SYNC,
        state.getNamespace(),
        SeverityNumber.DEBUG,
        (log) => log("Merge unblocked (missing main data): got data"),
      );
    }
    const output = iState.bufferedData.peekAt(0)!;
    const newRoot = iState.toRootOutput(output.output);
    return {
      updateCache: () => {
        output.cleanup();
        state.bufferedData.remove(0, 1);
      },
      newRoot,
    };
  }

  // 3) If a previous state created data, keep merging data from this state into it
  //    until we've exceeded the time range
  while (
    rootInfo.comparePage.compare(
      state.lastPage.root,
      rootInfo.toPage(rootInfo.value),
    ) <= 0
  ) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge blocked (missing parallel data): waiting for data"),
    );
    yield* state.newPageCondVar.wait();
    log.remote(
      ComponentNames.PAIMA_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge unblocked (missing parallel data): got data"),
    );
  }
  const cleanups = getFromBuffer(
    {
      data: iState.bufferedData,
      toPage: iState.toRootPage,
    },
    {
      data: rootInfo.value,
      toPage: rootInfo.toPage,
    },
    rootInfo.comparePage,
    iState.mergeDatum,
  );

  return {
    updateCache: () => {
      state.bufferedData.remove(0, cleanups.length);
      for (const fn of cleanups) {
        fn();
      }
    },
    newRoot: undefined,
  };
}

/**
 * Merge as much of the data into the root as possible
 * Note: it does *not* modify the child data
 *
 * @returns the amount of elements that can be added to the root data
 */
function getFromBuffer<Output, RootOutput, RootPage>(
  child: {
    data: Deque<OutputAndCleanup<Output>>;
    toPage: (data: Output) => RootPage;
  },
  root: {
    data: RootOutput;
    toPage: (data: RootOutput) => RootPage;
  },
  pageRelation: PageRelation<RootPage>,
  mergeData: (child: Output, root: RootOutput) => void,
): CacheCleanup[] {
  const cleanups: CacheCleanup[] = [];
  let nextElem = child.data.peekAt(cleanups.length);

  while (
    nextElem != null &&
    pageRelation.compare(
        child.toPage(nextElem.output),
        root.toPage(root.data),
      ) <= 0
  ) {
    mergeData(nextElem.output, root.data);
    cleanups.push(nextElem.cleanup);
    nextElem = child.data.peekAt(cleanups.length);
  }
  return cleanups;
}
