import type { CardanoSyncClient } from "@utxorpc/sdk";
import type { cardano } from "@utxorpc/spec";
import type { OutputAndCleanup } from "../base/state.ts";
import Deque from "denque";
import type { BlockNumber } from "@paima/utils";
import type { Operation } from "effection";
import { conditionVariable } from "@paima/utils";
import type { BlockAndTimestamp, Page } from "./types.ts";
import { Buffer } from "node:buffer";

// TODO: https://github.com/utxorpc/node-sdk/pull/38
type ChainPoint = {
  slot: number | string;
  hash: string;
};

export class BufferedRpc {
  private readonly buffer: Deque<OutputAndCleanup<BlockAndTimestamp>> =
    new Deque();
  private readonly newDataCondVar = conditionVariable<void>();
  private bestBlock: undefined | Page = undefined;

  constructor(
    public readonly client: CardanoSyncClient,
    /**
     * Finality should ensure that we never expose data that could be affected by `undo`
     * recall: finality is in terms of blocks created (not in terms of slots)
     */
    private readonly finality: BlockNumber,
  ) {}

  public async start(point: undefined | ChainPoint): Promise<void> {
    // TODO: these parameters can change
    //       see: https://github.com/utxorpc/spec/issues/149
    const byronGenesis = await fetch(
      "http://localhost:10000/local-cluster/api/admin/devnet/genesis/byron",
    );
    const byronGenesisJson = await byronGenesis.json();
    const shelleyGenesis = await fetch(
      "http://localhost:10000/local-cluster/api/admin/devnet/genesis/shelley",
    );
    const shelleyGenesisJson = await shelleyGenesis.json();
    const toTimestamp = (block: cardano.Block) => {
      // TODO: hardcoded to yaci-devkit magic number until https://github.com/utxorpc/spec/pull/147
      if (block.header!.slot < 600) {
        return new Date(
          1000 * byronGenesisJson.startTime +
            (Number(block.header!.slot) *
              byronGenesisJson.blockVersionData.slotDuration),
        ).getTime();
      }
      // TODO: in yaci-devkit, systemStart starts at the time Shelley starts
      //       but on mainnet, it starts at Byron start
      //       so we hardcode the yaci-devkit behavior until https://github.com/utxorpc/spec/issues/149
      return new Date(
        shelleyGenesisJson.systemStart,
      ).getTime() +
        (1000 * (Number(block.header!.slot) - 600) *
          shelleyGenesisJson.slotLength);
    };

    if (point != null) {
      const startBlock = await this.client.fetchBlock(point);
      this.bestBlock = {
        slot: Number(point.slot),
        hash: point.hash,
        height: Number(startBlock.header!.height),
      };
    } else {
      const firstBlock = await this.client.fetchHistory(undefined);
      point = {
        slot: Number(firstBlock.header!.slot),
        hash: Buffer.from(firstBlock.header!.hash).toString("hex"),
      };
    }

    let seenReset = false; // chainsync always returns "reset" as the first event
    // TODO: replace with watchTxByMatch once we have https://github.com/utxorpc/spec/issues/135
    const tip = this.client.followTip([point]);
    for await (
      const event of tip
    ) {
      if (event.action === "apply") {
        this.bestBlock = toPage(event.block);
        this.buffer.push({
          output: {
            block: event.block,
            timestamp: toTimestamp(event.block),
          },
          cleanup: () => {
            // we have to look up the position in the buffer again
            // since the position may have changed by the time we run the cleanup
            // note: cleanup is typically called in an ordered way, so we search from the start of the buffer
            const index = this.findFromStart(
              Number(event.block.header!.height),
            );
            if (index == null) {
              throw new Error(
                `Block not found for slot ${event.block.header!.height}`,
              );
            }
            this.buffer.remove(index, 1);
          },
        });
        this.newDataCondVar.wake();
      } else if (event.action === "undo") {
        this.buffer.pop();
      } else if (event.action === "reset") {
        if (!seenReset) {
          seenReset = true;
          continue;
        }

        throw new Error(
          `Paima node stuck on fork. Currently at point ${
            JSON.stringify(point)
          }`,
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
  ): OutputAndCleanup<BlockAndTimestamp>[] {
    const blocks: OutputAndCleanup<BlockAndTimestamp>[] = [];
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

  findFromStart = (height: BlockNumber): undefined | number => {
    for (let i = 0; i < this.buffer.length; i++) {
      if (
        Number(this.buffer.peekAt(i)!.output.block.header!.height) === height
      ) {
        return i;
      }
    }
    return undefined;
  };
}

function toPage(block: cardano.Block): Page {
  return {
    slot: Number(block.header!.slot),
    hash: Buffer.from(block.header!.hash).toString("hex"),
    height: Number(block.header!.height),
  };
}
