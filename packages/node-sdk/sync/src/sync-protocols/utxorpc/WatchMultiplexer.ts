import { type CardanoSyncClient, CardanoWatchClient, type CardanoTxEvent, type ClientBuilderOptions } from "@utxorpc/sdk";
import { cardano } from "@utxorpc/spec";
import type { watch } from "@utxorpc/spec";
import type { OutputAndCleanup } from "../base/state.ts";
import Deque from "denque";
import type { BlockNumber } from "@effectstream/utils";
import { conditionVariable, hexStringToUint8Array } from "@effectstream/utils";
import type { ChainPoint, CompletedBlock, PrimitiveEntryType } from "./types.ts";
import type { UtxorpcTxPredicate } from "@effectstream/config";
import { configPredicateToSdkPredicate, isEffectiveServerPredicate, predicateKey } from "./utils.ts";
import { Buffer } from "node:buffer";

type WatcherPendingBlock = {
  txs: cardano.Tx[];
  block: cardano.Block | undefined;
  idle: boolean;
  idleRef: watch.BlockRef | undefined;
};

type WatcherState = {
  predicateKey: string;
  sdkPredicate: ReturnType<typeof configPredicateToSdkPredicate>;
  pendingBlocks: Map<number, WatcherPendingBlock>;
  highestSeenHeight: number;
};

export class WatchMultiplexer {
  private readonly watchers: Map<string, WatcherState> = new Map();
  private readonly completedBuffer: Deque<OutputAndCleanup<CompletedBlock>> = new Deque();
  private readonly newDataCondVar = conditionVariable<void>();
  private highestConfirmedHeight: number | undefined = undefined;
  private lowestIncompleteHeight: number = 0;
  private slotOriginTimestamp: bigint | undefined = undefined;
  /**
   * Incremented by every {@link start} call so events from a previous
   * generation's streams can be identified and dropped.
   *
   * `start` can now be called more than once: `startSync` supervises the
   * producer and restarts it when the stream dies. All multiplexer state lives
   * on this instance, and the gRPC streams of the previous generation are not
   * cancellable from here — a `Promise.all` rejection from ONE watcher aborts
   * `start` while its siblings keep streaming. Without this guard a restart
   * would run two live streams per predicate into the same `pendingBlocks`,
   * pushing each matched tx twice. Duplicate primitives in a block mean
   * duplicate scheduled STF inputs, i.e. non-deterministic state — the exact
   * failure the whole pipeline is built to avoid.
   */
  private generation = 0;

  constructor(
    private readonly clientOptions: ClientBuilderOptions,
    primitivesByPredicate: Map<string, { predicate: UtxorpcTxPredicate; primitiveEntries: PrimitiveEntryType[] }>,
    private readonly finality: BlockNumber,
    private readonly syncClient: CardanoSyncClient,
  ) {
    for (const [key, { predicate }] of primitivesByPredicate) {
      const effective = isEffectiveServerPredicate(predicate);
      const sdkPredicate = effective
        ? configPredicateToSdkPredicate(predicate)
        : {};

      if (!effective) {
        console.warn(
          `[WatchMultiplexer] Predicate for key "${key}" has no server-filterable fields. Falling back to match-all with client-side filtering.`
        );
      }

      this.watchers.set(key, {
        predicateKey: key,
        sdkPredicate,
        pendingBlocks: new Map(),
        highestSeenHeight: 0,
      });
    }
  }

  public async resolveOrigin(): Promise<ChainPoint> {
    const blocks = await this.syncClient.fetchHistory(undefined, 1);
    if (!blocks.length) throw new Error("No blocks found on chain");
    const header = blocks[0].parsedBlock.header!;
    return {
      slot: Number(header.slot),
      hash: Buffer.from(header.hash).toString("hex"),
    };
  }

  public async start(point?: ChainPoint): Promise<void> {
    if (this.watchers.size === 0) {
      throw new Error("No watchers configured");
    }

    if (this.slotOriginTimestamp === undefined) {
      try {
        const blocks = await this.syncClient.fetchHistory(undefined, 1);
        if (blocks.length > 0) {
          const blk = blocks[0].parsedBlock;
          if (blk.timestamp && blk.header?.slot != null) {
            this.slotOriginTimestamp = blk.timestamp - blk.header.slot;
          }
        }
      } catch {
        // Chain may not be ready yet — slotOriginTimestamp will be set on the first Apply event
      }
    }

    const generation = ++this.generation;

    // Drop half-assembled work from the previous generation. A block is only
    // completed once EVERY watcher has passed it, so at the moment a stream
    // died some heights had been seen by some watchers and not others. The new
    // stream re-delivers those heights from the resume point, and merging the
    // two views would double their txs. Heights below `lowestIncompleteHeight`
    // are already completed and are never revisited, so this discards exactly
    // the in-flight window.
    if (generation > 1) {
      for (const [, watcher] of this.watchers) {
        for (const [height] of watcher.pendingBlocks) {
          if (height >= this.lowestIncompleteHeight) {
            watcher.pendingBlocks.delete(height);
          }
        }
        watcher.highestSeenHeight = Math.max(
          this.lowestIncompleteHeight - 1,
          0,
        );
      }
    }

    const intersect = point ? [point] : [];
    const promises: Promise<void>[] = [];
    for (const [key, watcher] of this.watchers) {
      const watchClient = new CardanoWatchClient(this.clientOptions);
      promises.push(this.runWatcher(key, watcher, watchClient, intersect, generation));
    }

    console.log(
      `[WatchMultiplexer] Started ${this.watchers.size} watcher(s) (generation ${generation})`,
    );
    await Promise.all(promises);
  }

  private async runWatcher(
    key: string,
    watcher: WatcherState,
    watchClient: CardanoWatchClient,
    intersect: ChainPoint[],
    generation: number,
  ): Promise<void> {
    const stream = watchClient.watchTxByPredicate(watcher.sdkPredicate, intersect);
    for await (const event of stream) {
      // A superseded generation must contribute nothing. Breaking here also
      // closes the underlying stream via the async iterator's return path,
      // which is the only way to stop it from this side.
      if (generation !== this.generation) {
        console.warn(
          `[WatchMultiplexer] Watcher "${key}" from generation ${generation} superseded by ${this.generation}; closing`,
        );
        return;
      }
      this.handleEvent(key, watcher, event);
    }
    console.warn(`[WatchMultiplexer] Watcher "${key}" stream ended unexpectedly`);
  }

  private handleEvent(
    key: string,
    watcher: WatcherState,
    event: CardanoTxEvent,
  ): void {
    if (event.action === "apply") {
      const height = Number(event.Block.header!.height);
      let pending = watcher.pendingBlocks.get(height);
      if (!pending) {
        pending = { txs: [], block: undefined, idle: false, idleRef: undefined };
        watcher.pendingBlocks.set(height, pending);
      }
      pending.txs.push(event.Tx);
      pending.block = event.Block;
      pending.idle = false;
      if (this.slotOriginTimestamp === undefined) {
        const blk = event.Block;
        this.slotOriginTimestamp = blk.timestamp - blk.header!.slot;
      }
      if (height > watcher.highestSeenHeight) {
        watcher.highestSeenHeight = height;
      }
      this.tryCompleteBlocks();
    } else if (event.action === "idle") {
      const height = Number(event.BlockRef.height);
      let pending = watcher.pendingBlocks.get(height);
      if (!pending) {
        pending = { txs: [], block: undefined, idle: true, idleRef: event.BlockRef };
        watcher.pendingBlocks.set(height, pending);
      } else {
        pending.idle = true;
        pending.idleRef = event.BlockRef;
      }
      if (height > watcher.highestSeenHeight) {
        watcher.highestSeenHeight = height;
      }
      this.tryCompleteBlocks();
    } else if (event.action === "undo") {
      const height = Number(event.Block.header!.height);
      this.handleUndo(height);
    }
  }

  private handleUndo(fromHeight: number): void {
    // Pop all completed blocks at or above the undo height
    while (this.completedBuffer.length > 0) {
      const last = this.completedBuffer.peekBack()!;
      if (last.output.height < fromHeight) break;
      this.completedBuffer.pop();
    }

    // Clear pending blocks at or above the undo height for all watchers
    for (const [, watcher] of this.watchers) {
      for (const [h] of watcher.pendingBlocks) {
        if (h >= fromHeight) {
          watcher.pendingBlocks.delete(h);
        }
      }
      if (watcher.highestSeenHeight >= fromHeight) {
        watcher.highestSeenHeight = fromHeight - 1;
      }
    }

    // Reset confirmed height
    if (this.highestConfirmedHeight != null && this.highestConfirmedHeight >= fromHeight) {
      this.highestConfirmedHeight = fromHeight - 1;
    }
    if (this.lowestIncompleteHeight >= fromHeight) {
      this.lowestIncompleteHeight = fromHeight;
    }
  }

  private tryCompleteBlocks(): void {
    const minHighest = Math.min(...[...this.watchers.values()].map(w => w.highestSeenHeight));
    if (minHighest <= 0) return;

    let height = this.lowestIncompleteHeight;
    if (height === 0) {
      let lowest = Infinity;
      for (const [, watcher] of this.watchers) {
        for (const [h] of watcher.pendingBlocks) {
          if (h < lowest) lowest = h;
        }
      }
      if (lowest === Infinity) return;
      height = lowest;
    }

    // A block at `height` is only safe to process once every watcher has
    // advanced past it (received an event for height+1 or later).  This
    // guarantees all Apply events for that height have been delivered —
    // the Watch protocol can send multiple Apply events per block.
    while (height < minHighest) {
      const completed = this.buildCompletedBlock(height);
      if (completed) {
        const finalityThreshold = minHighest - this.finality;
        if (height <= finalityThreshold) {
          this.completedBuffer.push({
            output: completed,
            cleanup: () => this.completedBuffer.shift(),
          });
          this.highestConfirmedHeight = height;
          this.newDataCondVar.wake();
        } else {
          break;
        }
      }

      for (const [, watcher] of this.watchers) {
        watcher.pendingBlocks.delete(height);
      }

      height++;
    }
    this.lowestIncompleteHeight = height;
  }

  private buildCompletedBlock(height: number): CompletedBlock | null {
    let block: cardano.Block | undefined;
    let slot = 0;
    let hash = "";
    const matchedTxsByPredicate = new Map<string, cardano.Tx[]>();

    for (const [key, watcher] of this.watchers) {
      const pending = watcher.pendingBlocks.get(height);
      if (!pending) return null;

      if (pending.block) {
        block = pending.block;
        slot = Number(pending.block.header!.slot);
        hash = Buffer.from(pending.block.header!.hash).toString("hex");
      } else if (pending.idleRef && !block) {
        slot = Number(pending.idleRef.slot);
        hash = Buffer.from(pending.idleRef.hash).toString("hex");
      }

      if (pending.txs.length > 0) {
        matchedTxsByPredicate.set(key, pending.txs);
      }
    }

    if (!block) {
      const idleSlot = BigInt(slot);
      const idleHash = hexStringToUint8Array(hash);
      const estimatedTimestamp = this.slotOriginTimestamp != null
        ? this.slotOriginTimestamp + idleSlot
        : idleSlot;
      block = new cardano.Block({
        header: new cardano.BlockHeader({
          slot: idleSlot,
          hash: idleHash,
          height: BigInt(height),
        }),
        body: new cardano.BlockBody({ tx: [] }),
        timestamp: estimatedTimestamp,
      });
    }

    return { height, slot, hash, block, matchedTxsByPredicate };
  }

  public fetchBlocks(
    from: BlockNumber,
    to: BlockNumber,
  ): OutputAndCleanup<CompletedBlock>[] {
    const blocks: OutputAndCleanup<CompletedBlock>[] = [];
    for (let i = 0; i < this.completedBuffer.length; i++) {
      const entry = this.completedBuffer.peekAt(i)!;
      if (entry.output.height >= from) {
        blocks.push(entry);
      }
      if (entry.output.height >= to) {
        break;
      }
    }
    return blocks;
  }

  public lastHeight(): bigint | undefined {
    if (this.highestConfirmedHeight == null) return undefined;
    return BigInt(this.highestConfirmedHeight);
  }

}
