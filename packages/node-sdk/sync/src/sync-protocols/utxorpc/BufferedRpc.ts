import type { CardanoSyncClient, CardanoWatchClient } from "@utxorpc/sdk";
import type { cardano } from "@utxorpc/spec";
import type { OutputAndCleanup } from "../base/state.ts";
import Deque from "denque";
import type { BlockNumber } from "@effectstream/utils";
import type { Operation } from "effection";
import { conditionVariable } from "@effectstream/utils";
import type { BlockAndTxs, ChainPoint, Page, PrimitiveEntryType } from "./types.ts";
import { hashEqual } from "./utils.ts";
import { Buffer } from "node:buffer";

export class BufferedRpc {
  private readonly buffer: Deque<OutputAndCleanup<BlockAndTxs>> =
    new Deque();
  private readonly newDataCondVar = conditionVariable<void>();

  constructor(
    public readonly syncClient: CardanoSyncClient,
    public readonly watchClient: CardanoWatchClient,
    /**
     * Finality should ensure that we never expose data that could be affected by `undo`
     * recall: finality is in terms of blocks created (not in terms of slots)
     */
    private readonly finality: BlockNumber,
  ) {}

  public async start(point: undefined | ChainPoint, primitives: PrimitiveEntryType[]): Promise<void> {
    const predicate = {
      anyOf: primitives.map(p => p.primitive.predicate),
    };
    const intersect = point ? [point] : [];
    const txEvents = this.watchClient.watchTxByPredicate(predicate, intersect);

    const cleanupBlock = (hash: Uint8Array) => {
      for (let i = this.buffer.length; i >= 0; --i) {
        const entry = this.buffer.peekAt(i)!;
        if (hashEqual(entry.output.block.header!.hash, hash)) {
          this.buffer.removeOne(i);
          return;
        }
      }
    }

    for await (const txEvent of txEvents) {
      if (txEvent.action === "idle") {
        const block = await this.syncClient.fetchBlock(txEvent.BlockRef);
        this.buffer.push({
          output: {
            block: block.parsedBlock,
            txs: [],
          },
          cleanup: () => cleanupBlock(block.parsedBlock.header!.hash),
        });
        this.newDataCondVar.wake();
      } else if (txEvent.action === "apply") {
        const lastBlock = this.buffer.peekBack();
        if (lastBlock && hashEqual(lastBlock.output.block.header!.hash, txEvent.Block.header!.hash)) {
          lastBlock.output.txs.push(txEvent.Tx);
        } else {
          this.buffer.push({
            output: {
              block: txEvent.Block,
              txs: [txEvent.Tx],
            },
            cleanup: () => cleanupBlock(txEvent.Block.header!.hash),
          });
          this.newDataCondVar.wake();
        }
      } else if (txEvent.action === "undo") {
        for (let lastBlock = this.buffer.peekBack(); lastBlock; lastBlock = this.buffer.peekBack()) {
          if (lastBlock.output.block.header!.height > txEvent.Block.header!.height) {
            // rolled back past this apparently-empty block
            this.buffer.pop();
            continue;
          }
          if (lastBlock.output.block.header!.height === txEvent.Block.header!.height) {
            lastBlock.output.txs = lastBlock.output.txs.filter(tx => !hashEqual(tx.hash, txEvent.Tx.hash));
            if (!lastBlock.output.txs.length) {
              this.buffer.pop();
            }
          }
          break;
        }
      }
    }
  }

  public *storedBlocks(
    height: undefined | BlockNumber,
  ): Operation<{ from: Page; to: Page }> {
    let lastElement = this.buffer.peekBack();

    if (height == null) {
      height = 0;
    }

    // if we have nothing in our buffer yet, or if we're asking for a future height
    while (
      this.buffer.length == 0 ||
      lastElement == null ||
      height >= Number(lastElement.output.block.header!.height) - this.finality
    ) {
      yield* this.newDataCondVar.wait();
      lastElement = this.buffer.peekBack();
    }

    const endIndex = (() => {
      let endIndex = this.buffer.length - 1;
      const highestValid =
        Number(this.buffer.peekBack()!.output.block.header!.height) -
        this.finality;
      while (
        endIndex > 0 &&
        Number(this.buffer.peekAt(endIndex)!.output.block.header!.height) >
          highestValid
      ) {
        endIndex--;
      }

      return endIndex;
    })();
    const startIndex = (() => {
      let startIndex = endIndex;
      while (
        startIndex > 0 &&
        Number(
            this.buffer.peekAt(startIndex - 1)!.output.block.header!.height,
          ) >
          height
      ) {
        startIndex--;
      }
      return startIndex;
    })();
    return {
      from: toPage(this.buffer.peekAt(startIndex)!.output.block),
      to: toPage(this.buffer.peekAt(endIndex)!.output.block),
    };
  }

  /**
   * Return an array of blocks
   * This is preferred over `fetchBlock` where there may be gaps in blockHeight
   * Or when you don't want a blocking call
   */
  public fetchBlocks(
    from: BlockNumber, // (inclusive)
    to: BlockNumber, // (inclusive)
  ): OutputAndCleanup<BlockAndTxs>[] {
    const blocks: OutputAndCleanup<BlockAndTxs>[] = [];
    for (let i = 0; i < this.buffer.length; i++) {
      const block = this.buffer.peekAt(i)!;
      if (Number(block.output.block.header!.height) >= from) {
        blocks.push(block);
      }
      if (Number(block.output.block.header!.height) >= to) {
        break;
      }
    }
    return blocks;
  }
}

function toPage(block: cardano.Block): Page {
  return {
    slot: Number(block.header!.slot),
    hash: Buffer.from(block.header!.hash).toString("hex"),
    height: Number(block.header!.height),
  };
}
