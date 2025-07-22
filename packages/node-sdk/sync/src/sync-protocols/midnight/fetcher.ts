import {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  type PrimitiveEntry,
  type SyncProtocolWithNetwork,
} from "@paima/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { Block, Input, Output, Page, PrimitiveType } from "./types.ts";
import { all, call, type Operation } from "effection";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import { bound } from "@paima/utils";
import { MidnightClient } from "./MidnightClient.ts";
import { PageRequest } from "../base/page.ts";

export class MidnightFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: MidnightClient;
  constructor(
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL }
    >,
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
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];
    console.log(
      `Fetching blocks from ${data.from} to ${data.to}. Presync: ${data.isPresync}`,
    );
    for (let height = data.from; height <= data.to; height++) {
      const result = yield* call(() => this.client.fetchBlock(height));
      if (!result?.block) {
        // Block not found, we can stop here.
        // This can happen if we are at the tip of the chain.
        break;
      }
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

    if (outputs.length === 0) {
      if (!lastPage) {
        // This should not happen if we have a start block, but as a fallback:
        throw new Error(
          `Could not fetch any blocks from ${data.from} to ${data.to} and no previous page was found.`,
        );
      }
      return {
        output: [],
        lastPage: lastPage,
      };
    }

    const lastOutput = outputs[outputs.length - 1].output;

    return {
      output: outputs,
      lastPage: {
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
    primitives: PrimitiveEntry<ConfigSyncProtocolType.MIDNIGHT_PARALLEL>[],
  ): Operation<PrimitiveType[]> {
    const client = this.client;
    const allOperations: Operation<PrimitiveType>[] = [];
    for (const primitive of primitives) {
      allOperations.push(
        this.fetchContractState(
          height,
          client,
          primitive,
          block,
        ),
      );
    }
    return (yield* all(allOperations)).flat();
  }

  @bound
  *fetchContractState(
    height: number,
    client: MidnightClient,
    primitive: PrimitiveEntry<ConfigSyncProtocolType.MIDNIGHT_PARALLEL>,
    block: Block,
  ): Operation<PrimitiveType> {
    const contractAddress = primitive.primitive.contractAddress;
    const state = yield* call(() =>
      client.fetchContractState(contractAddress, height)
    );
    if (!state) {
      throw new Error(
        `Contract state not found for ${contractAddress} at block ${height}`,
      );
    }
    return {
      input: primitive.primitive,
      output: {
        primitive: ConfigPrimitiveType.MidnightContractState,
        payloadType: ConfigPrimitivePayloadType.Event,
        payload: JSON.stringify(state.data.encode()),
        syncProtocol: {
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          name: this.config.syncProtocol.name,
          internal: {},
          payload: {
            primitiveName: primitive.primitive.name,
            mainchain: {
              blockNumber: null,
              timestamp: null,
            },
            caip2: `midnight:${this.config.network.networkId}`,
            ownChain: {
              blockNumber: height,
            },
            transactionHash:
              block.transactions.find((t) =>
                t.contractCalls.find((c) => c.address === contractAddress)
              )?.hash ??
                "0x0000000000000000000000000000000000000000000000000000000000000000",
          },
        },
      },
      primitiveType: ConfigPrimitiveType.MidnightContractState,
      payloadType: ConfigPrimitivePayloadType.Event,
    };
  }
}
