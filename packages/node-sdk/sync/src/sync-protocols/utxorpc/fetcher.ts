import { BaseDataFetcher, type DataFetched } from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Operation } from "effection";
import { bound } from "@effectstream/utils";
import type { Input, Output, Page } from "./types.ts";
import type { OutputAndCleanup, RootConversion } from "../base/state.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@effectstream/config";
import type { BufferedRpc } from "./BufferedRpc.ts";
import { Buffer } from "node:buffer";

export class UtxoRpcFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage> // PrimitiveFetcher<Input, Page, cardano.Block, PrimitiveType>,
{
  constructor(
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.CARDANO }
    >,
    readonly client: BufferedRpc,
  ) {
    super(config.syncProtocol.name);
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
      // console.log(block.output.block.toJson({ emitDefaultValues: true }));
      outputs.push({
        output: {
          // TODO: What is the correct block hash?
          blockHashes: [String(block.output.block.header?.hash)],
          raw: block.output,
          // TODO: https://github.com/utxorpc/spec/issues/135
          //       mock data for now
          primitives: [{
            value: Math.round(Math.random() * 1000000),
            block: block.output.block,
            timestamp: block.output.timestamp,
          } as any],
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
            outputs[outputs.length - 1].output.raw.block.header!.slot,
          ),
          height: Number(
            outputs[outputs.length - 1].output.raw.block.header!.height,
          ),
          hash: Buffer.from(
            outputs[outputs.length - 1].output.raw.block.header!.hash,
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
}
