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
    const outputs: OutputAndCleanup<Output>[] = [];
    const blocks = this.client.fetchBlocks(data.from, data.to);
    for (const block of blocks) {
      outputs.push({
        output: {
          // TODO: What is the correct block hash?
          blockHashes: [String(block.output.header?.hash)],
          raw: block.output,
          primitives: this.findPrimitives(block.output),
        },
        cleanup: block.cleanup,
      });
    }
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: Number(data.to),
        own: {
          slot: Number(
            outputs[outputs.length - 1].output.raw.header!.slot,
          ),
          height: Number(
            outputs[outputs.length - 1].output.raw.header!.height,
          ),
          hash: Buffer.from(
            outputs[outputs.length - 1].output.raw.header!.hash,
          )
            .toString("hex"),
        },
        root: rootConversion.toRootPage({
          blockHashes: [],
          primitives: [], // TODO: I think this can be left empty here
          raw: outputs[outputs.length - 1].output.raw,
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
            absoluteSlot: Number(block.header!.slot),
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
