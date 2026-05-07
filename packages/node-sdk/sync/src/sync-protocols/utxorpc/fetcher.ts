import { BaseDataFetcher, type DataFetched } from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Operation } from "effection";
import { bound, uint8ArrayToHexString } from "@effectstream/utils";
import type { ChainPoint, ConfigType, Input, Output, Page, PrimitiveType } from "./types.ts";
import type { OutputAndCleanup, RootConversion } from "../base/state.ts";
import type { BufferedRpc } from "./BufferedRpc.ts";
import { Buffer } from "node:buffer";
import type { cardano } from "@utxorpc/spec";
import { hashEqual, matchesPredicate } from "./utils.ts";

export class UtxoRpcFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage> // PrimitiveFetcher<Input, Page, cardano.Block, PrimitiveType>,
{
  constructor(
    readonly config: ConfigType,
    readonly client: BufferedRpc,
  ) {
    super(config.syncProtocol.name);
  }

  @bound
  async startAsync(point?: ChainPoint) {
    await this.client.start(point);
  }

  @bound
  async resolveOrigin(): Promise<ChainPoint> {
    return this.client.resolveOrigin();
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    console.log(
      `[UTXORPC] Fetching blocks from ${data.from} to ${data.to}. ${
        data.isPresync ? "[presync]" : ""
      }`,
    );
    const fetchAllBlocks = this.config.primitives.some(
      (p) => p.primitive.getAllBlockHeaders,
    );

    const outputs: OutputAndCleanup<Output>[] = [];
    const blocks = this.client.fetchBlocks(data.from, data.to);
    let lastBlock: typeof blocks[number] | undefined;
    for (const block of blocks) {
      lastBlock = block;
      const primitives = this.findPrimitives(block.output);
      if (fetchAllBlocks || primitives.length > 0) {
        outputs.push({
          output: {
            blockHashes: [String(block.output.header?.hash)],
            raw: block.output,
            primitives,
          },
          cleanup: block.cleanup,
        });
      }
    }
    if (lastBlock && (outputs.length === 0 || outputs[outputs.length - 1].output.raw !== lastBlock.output)) {
      outputs.push({
        output: {
          blockHashes: [String(lastBlock.output.header?.hash)],
          raw: lastBlock.output,
          primitives: [],
        },
        cleanup: lastBlock.cleanup,
      });
    }
    const lastRaw = lastBlock!.output;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: Number(data.to),
        own: {
          slot: Number(lastRaw.header!.slot),
          height: Number(lastRaw.header!.height),
          hash: Buffer.from(lastRaw.header!.hash).toString("hex"),
        },
        root: rootConversion.toRootPage({
          blockHashes: [],
          primitives: [],
          raw: lastRaw,
        }),
      },
    };
  }

  @bound
  findPrimitives(block: cardano.Block): PrimitiveType[] {
    const primitiveResponses: PrimitiveType[] = [];
    for (const tx of block.body?.tx ?? []) {
      let logIndex = 0;
      for (const primitveEntry of this.config.primitives) {
        if (!matchesPredicate(tx, primitveEntry.primitive.predicate)) {
          continue;
        }
        const transactionIndex = block.body?.tx.findIndex(t => hashEqual(t.hash, tx.hash));
        primitiveResponses.push({
          syncProtocol: {
            name: primitveEntry.syncProtocol,
            blockNumber: Number(block.header!.height),
            transactionHash: uint8ArrayToHexString(tx.hash),
            transactionIndex,
            contractAddress: '',
            logIndex,
          },
          primitive: primitveEntry.primitive.name,
          output: {
            payloadType: 'utxorpc-response',
            payload: { tx }
          }
        });
        ++logIndex;
      }
    }
    return primitiveResponses;
  }

  lastHeight(): bigint | undefined {
    // Calling this.client.syncClient.getTip(); 
    // returns the hash and slot, but not the block height
    return this.client.lastHeight();
  }
}
