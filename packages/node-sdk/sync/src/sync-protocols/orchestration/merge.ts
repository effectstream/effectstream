import type { Channel, Operation } from "effection";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
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
import { ENV } from "@effectstream/utils/node-env";

export const mergeCoalescingBoundaries = {
  minScheduledBlockHeight: null as number | null,
  minScheduledTimestampMs: null as number | null,
  migrationBlockHeights: [] as number[],
};

function isCoalescableEmpty(block: ChainBlock): boolean {
  if (block.primitives.length > 0) return false;

  const bh = block.blockNumber;
  if (mergeCoalescingBoundaries.migrationBlockHeights.includes(bh)) {
    return false;
  }

  if (
    mergeCoalescingBoundaries.minScheduledBlockHeight != null &&
    bh >= mergeCoalescingBoundaries.minScheduledBlockHeight
  ) {
    return false;
  }

  if (
    mergeCoalescingBoundaries.minScheduledTimestampMs != null &&
    block.timestamp >= mergeCoalescingBoundaries.minScheduledTimestampMs
  ) {
    return false;
  }

  return true;
}

function mergeBlockInfo(
  target: ChainBlock["blockInfo"],
  source: ChainBlock["blockInfo"],
): ChainBlock["blockInfo"] {
  const map = new Map<string, ChainBlock["blockInfo"][number]>();
  for (const item of target) {
    map.set(item.protocol_name, item);
  }
  for (const item of source) {
    map.set(item.protocol_name, item);
  }
  return Array.from(map.values());
}

function mergeResumePages(
  target: ChainBlock["resumePages"],
  source: ChainBlock["resumePages"],
): ChainBlock["resumePages"] {
  const map = new Map<string, ChainBlock["resumePages"][number]>();
  for (const item of target) {
    map.set(item.protocol_name, item);
  }
  for (const item of source) {
    map.set(item.protocol_name, item);
  }
  return Array.from(map.values());
}

export function* startMerge(
  syncProtocols: AllSyncProtocols[],
  finalizedBlockStream: Channel<ChainBlock, void>,
): Operation<ChainBlock> {
  let pendingEmptyRun: {
    endpoint: ChainBlock;
    count: number;
  } | null = null;

  const flushPendingRun = function* (): Operation<void> {
    if (pendingEmptyRun == null) return;
    const { endpoint } = pendingEmptyRun;
    endpoint.coalescedCount = pendingEmptyRun.count;

    log.remote(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-merge",
      SeverityNumber.INFO,
      (log) =>
        log(
          `producing coalesced empty block run of length ${pendingEmptyRun!.count} ending at block ${endpoint.blockNumber}`,
        ),
    );

    yield* finalizedBlockStream.send(endpoint);
    pendingEmptyRun = null;
  };

  const enabled = ENV.EFFECTSTREAM_COALESCE_EMPTY_BLOCKS;
  const MAX_PRODUCER_COALESCE = 1000;

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
          ComponentNames.EFFECTSTREAM_SYNC,
          "block-merge",
          SeverityNumber.DEBUG,
          (log) => log(`new block ${mergeInfo.newRoot?.blockNumber}`),
        );
      }
    }
    if (newBlock == null) continue;

    if (enabled && isCoalescableEmpty(newBlock)) {
      if (pendingEmptyRun == null) {
        pendingEmptyRun = {
          endpoint: newBlock,
          count: 1,
        };
      } else {
        pendingEmptyRun.endpoint.blockNumber = newBlock.blockNumber;
        pendingEmptyRun.endpoint.timestamp = newBlock.timestamp;
        pendingEmptyRun.endpoint.blockInfo = mergeBlockInfo(
          pendingEmptyRun.endpoint.blockInfo,
          newBlock.blockInfo,
        );
        pendingEmptyRun.endpoint.resumePages = mergeResumePages(
          pendingEmptyRun.endpoint.resumePages,
          newBlock.resumePages,
        );
        pendingEmptyRun.count++;
      }

      // Run cleanups eagerly so the consumed datum leaves the Deque now, instead
      // of deferring to flush. This (a) keeps the main chain's Deque from growing
      // by one entry per coalesced block across a long run, and (b) makes the
      // tip check below meaningful: with the consumed datum removed,
      // bufferedData.size() === 0 means the buffer is drained and we're at the
      // tip. Safe because, during an empty run, every cleanup is a no-op — the
      // main (NTP) datum's cleanup is `() => {}` and parallel chains merge
      // nothing (cleanups.length === 0). Resume durability is unaffected: the
      // runtime is the sole writer of the persisted resume marker, which only
      // lands when the coalesced block commits downstream (CLAUDE.md #5).
      for (const fn of cleanup) {
        fn();
      }

      // At the tip (steady state) the main chain produces one slot per
      // blockTimeMS, so the Deque drains to empty after each one — flush
      // immediately so trickle-in blocks aren't held back. While catching up the
      // Deque stays non-empty and the run keeps accumulating until the cap.
      const ntpState = syncProtocols[0];
      const atTip = ntpState.bufferedData.size() === 0;
      if (pendingEmptyRun.count >= MAX_PRODUCER_COALESCE || atTip) {
        yield* flushPendingRun();
      }
    } else {
      if (pendingEmptyRun != null) {
        yield* flushPendingRun();
      }
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        "block-merge",
        SeverityNumber.INFO,
        (log) => log(`producing block ${newBlock?.blockNumber}`),
      );

      yield* finalizedBlockStream.send(newBlock);

      for (const fn of cleanup) {
        fn();
      }
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
      ComponentNames.EFFECTSTREAM_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge blocked (first sync): waiting for page"),
    );
    yield* state.newPageCondVar.wait();
    log.remote(
      ComponentNames.EFFECTSTREAM_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge unblocked (first sync): got page"),
    );
  }

  // 2) Handle case where this is the first in the list of states to merge data from
  if (rootInfo.value == null) {
    while (state.bufferedData.size() === 0) {
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        state.getNamespace(),
        SeverityNumber.DEBUG,
        (log) => log("Merge blocked (missing main data): waiting for data"),
      );
      yield* state.newDataCondVar.wait();
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        state.getNamespace(),
        SeverityNumber.DEBUG,
        (log) => log("Merge unblocked (missing main data): got data"),
      );
    }
    const output = iState.bufferedData.peekAt(0)!;
    const newRoot = iState.toRootOutput(output.output);
    // Resume marker: the single datum this root block is built from (CLAUDE.md #5).
    newRoot.resumePages.push({
      protocol_name: state.name,
      lastPage: iState.outputToLastPage(output.output),
    });
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
    // Publish the demand before waiting so the cap exempts this chain while the
    // merge is gated on its page (see SyncState.mergeWaitingForPage). No lock
    // needed: the fetch loop re-polls stateToInput every pollingInterval.
    state.mergeWaitingForPage = true;
    state.mergeDemandRoot = rootInfo.toPage(rootInfo.value);
    log.remote(
      ComponentNames.EFFECTSTREAM_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge blocked (missing parallel data): waiting for data"),
    );
    yield* state.newPageCondVar.wait();
    log.remote(
      ComponentNames.EFFECTSTREAM_SYNC,
      state.getNamespace(),
      SeverityNumber.DEBUG,
      (log) => log("Merge unblocked (missing parallel data): got data"),
    );
  }
  state.mergeWaitingForPage = false;
  state.mergeDemandRoot = undefined;
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

  // Resume marker: the last (highest) datum merged this iteration, still in the
  // Deque at `cleanups.length - 1` (cleanup runs after send). Nothing consumed →
  // no marker. See CLAUDE.md #5.
  if (cleanups.length > 0) {
    const lastConsumed = iState.bufferedData.peekAt(cleanups.length - 1)!;
    rootInfo.value.resumePages.push({
      protocol_name: state.name,
      lastPage: iState.outputToLastPage(lastConsumed.output),
    });
  }

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
