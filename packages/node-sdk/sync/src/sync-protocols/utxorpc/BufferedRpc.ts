import type { CardanoSyncClient } from "@utxorpc/sdk";
import type { cardano } from "@utxorpc/spec";
import type { OutputAndCleanup } from "../base/state.ts";
import Deque from "denque";
import type { BlockNumber } from "@effectstream/utils";
import type { Operation } from "effection";
import { conditionVariable } from "@effectstream/utils";
import type { ChainPoint, Page } from "./types.ts";
import { Buffer } from "node:buffer";

export class BufferedRpc {
  private readonly buffer: Deque<OutputAndCleanup<cardano.Block>> =
    new Deque();
  private readonly newDataCondVar = conditionVariable<void>();

  constructor(
    public readonly syncClient: CardanoSyncClient,
    /**
     * Finality should ensure that we never expose data that could be affected by `undo`
     * recall: finality is in terms of blocks created (not in terms of slots)
     */
    private readonly finality: BlockNumber,
  ) {}

  static lastHeight: bigint | undefined = undefined;
  static initialized = false;

  public lastHeight(): bigint | undefined {
    return BufferedRpc.lastHeight;
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
    if (BufferedRpc.initialized) {
      // We do not want to follow the tip again.
      throw new Error("BufferedRpc already initialized");
    }
    BufferedRpc.initialized = true;
    const intersect = point ? [point] : [];
    const blockEvents = this.syncClient.followTip(intersect);

    let seenReset = false;

    for await (const blockEvent of blockEvents) {
      if (blockEvent.action === "apply") {
        if (blockEvent.block.header?.height) {
          BufferedRpc.lastHeight = blockEvent.block.header?.height;
        }
        // This works ONLY because the buffer is processed FIFO
        this.buffer.push({
          output: blockEvent.block,
          cleanup: () => this.buffer.shift(),
        });
        this.newDataCondVar.wake();
      } else if (blockEvent.action === "undo") {
        if (blockEvent.block.header?.height) {
          BufferedRpc.lastHeight = blockEvent.block.header?.height;
        }
        this.buffer.pop();
      } else if (blockEvent.action === "reset") {
        if (!seenReset) {
          seenReset = true;
          continue;
        }

        const lastBlock = this.buffer.peekBack();
        const lastPoint = lastBlock ? JSON.stringify({
          slot: Number(lastBlock.output.header!.slot),
          hash: Buffer.from(lastBlock.output.header!.hash).toString("hex"),
        }) : "<none>";
        throw new Error(
          `Paima node stuck on fork. Currently at point ${lastPoint}`,
        );
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
      height >= Number(lastElement.output.header!.height) - this.finality
    ) {
      yield* this.newDataCondVar.wait();
      lastElement = this.buffer.peekBack();
    }

    const endIndex = (() => {
      let endIndex = this.buffer.length - 1;
      const highestValid =
        Number(this.buffer.peekBack()!.output.header!.height) -
        this.finality;
      while (
        endIndex > 0 &&
        Number(this.buffer.peekAt(endIndex)!.output.header!.height) >
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
            this.buffer.peekAt(startIndex - 1)!.output.header!.height,
          ) >
          height
      ) {
        startIndex--;
      }
      return startIndex;
    })();
    return {
      from: toPage(this.buffer.peekAt(startIndex)!.output),
      to: toPage(this.buffer.peekAt(endIndex)!.output),
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
  ): OutputAndCleanup<cardano.Block>[] {
    const blocks: OutputAndCleanup<cardano.Block>[] = [];
    for (let i = 0; i < this.buffer.length; i++) {
      const block = this.buffer.peekAt(i)!;
      if (Number(block.output.header!.height) >= from) {
        blocks.push(block);
      }
      if (Number(block.output.header!.height) >= to) {
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
