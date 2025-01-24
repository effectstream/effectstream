import type { CardanoSyncClient, ChainPoint } from "npm:@utxorpc/sdk";
import type { cardano } from "@utxorpc/spec";
import type { OutputAndCleanup } from "../base/state.ts";
import Deque from "denque";
import type { BlockNumber } from "@paima/utils";
import type { Operation } from "effection";
import { conditionVariable } from "@paima/utils";

export class BufferedRpc {
  private readonly buffer: Deque<OutputAndCleanup<cardano.Block>> = new Deque();
  private readonly newDataCondVar = conditionVariable<void>();

  constructor(
    public readonly client: CardanoSyncClient,
    /**
     * Finality should ensure that we never expose data that could be affected by `undo`
     */
    private readonly finality: number,
  ) {}

  public async start(point: ChainPoint): Promise<void> {
    for await (const event of this.client.followTip([point])) {
      if (event.action === "apply") {
        this.buffer.push({
          output: event.block,
          cleanup: () => {
            // we have to look up the slot number again
            // since the position may have changed by the time we run the cleanup
            const index = this.elementOf(Number(event.block.header!.height));
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
        throw new Error(
          `Paima node stuck on fork. Currently at point ${
            JSON.stringify(point)
          }`,
        );
      }
    }
  }

  public *fetchBlock(
    slotNumber: BlockNumber,
  ): Operation<OutputAndCleanup<cardano.Block>> {
    const lastElement = this.buffer.peekBack();
    // if we have nothing in our buffer yet, or if we're asking for a future slot
    while (
      lastElement == null ||
      slotNumber > Number(lastElement.output.header!.height) + this.finality
    ) {
      yield* this.newDataCondVar.wait();
    }
    const elementIndex = this.elementOf(slotNumber);
    if (elementIndex == null) {
      throw new Error(
        `utxorpc: block not found for block height ${slotNumber}`,
      );
    }
    return this.buffer.peekAt(elementIndex)!;
  }

  elementOf = (height: BlockNumber): undefined | number => {
    for (let i = 0; i < this.buffer.length; i++) {
      if (Number(this.buffer.peekAt(i)!.output.header!.height) === height) {
        return i;
      }
    }
    return undefined;
  };
}
