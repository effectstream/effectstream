import { BaseDataFetcher } from "../base/fetcher.ts";
import type {
  Block,
  ConfigType,
  Input,
  Output,
  Page,
  PrimitiveEntryType,
  PrimitiveType,
} from "./types.ts";
import { all, call, type Operation } from "effection";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import { bound, MidnightBlockHash } from "@paima/utils";
import { MidnightClient } from "./MidnightClient.ts";
import type { EncodedStateValue } from "@paima/config";

export class MidnightFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: MidnightClient;
  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    this.client = new MidnightClient(
      config.syncProtocol.indexer,
      config.syncProtocol.indexerWS ?? "ws://127.0.0.1:8088/api/v1/graphql/ws",
    );
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];
    console.log(
      `[Midnight] Fetching blocks from ${data.from} to ${data.to}. ${
        data.isPresync ? "[presync]" : ""
      }`,
    );
    for (let height = data.from; height <= data.to; height++) {
      const result = yield* call(() => this.client.fetchBlock(height));
      const block: Block = result.block;
      const primitives = yield* this.readPrimitives(
        height,
        block,
        this.config.primitives,
      );
      outputs.push({
        output: {
          raw: block,
          primitives,
        },
        cleanup: () => {},
      });
    }

    const lastOutput = outputs[outputs.length - 1].output;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: lastOutput.raw.height,
        own: {
          height: lastOutput.raw.height,
          hash: lastOutput.raw.hash,
        },
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }

  @bound
  *readPrimitives(
    height: number,
    block: Block,
    primitiveEntries: PrimitiveEntryType[],
  ): Operation<PrimitiveType[]> {
    const client = this.client;
    const allOperations: Operation<PrimitiveType | undefined>[] = [];
    for (const primitiveEntry of primitiveEntries) {
      allOperations.push(
        this.fetchContractState(
          height,
          client,
          primitiveEntry,
          block,
        ),
      );
    }
    return (yield* all(allOperations)).flat().filter(
      Boolean,
    ) as PrimitiveType[];
  }

  @bound
  *fetchContractState(
    height: number,
    client: MidnightClient,
    primitiveEntry: PrimitiveEntryType,
    block: Block,
  ): Operation<PrimitiveType | undefined> {
    const contractAddress = primitiveEntry.primitive.contractAddress;
    const state = yield* call(() =>
      client.fetchContractState(contractAddress, height)
    );
    if (!state) {
      return undefined;
    }
    return {
      syncProtocol: {
        name: primitiveEntry.syncProtocol,
        blockNumber: height,
        transactionHash:
          block.transactions.find((t) =>
            (t.contractCalls ?? []).find((c) => c.address === contractAddress)
          )?.hash ??
            "0x0000000000000000000000000000000000000000000000000000000000000000",
        contractAddress: contractAddress,
      },
      primitive: primitiveEntry.primitive.name,
      output: {
        payloadType: "midnight-contract-state",
        payload: state.data.encode() as unknown as EncodedStateValue,
      },
    };
  }
}
