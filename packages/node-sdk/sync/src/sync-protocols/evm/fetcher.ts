import {
  BaseDataFetcher,
  type DataFetched,
  type PaginatedFetcher,
} from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Chain, GetBlockReturnType, PublicClient } from "viem";
import type { Operation } from "effection";
import { all, call } from "effection";
import { AddressType, bound, type EvmRpcPageJson, keysOf } from "@paima/utils";
import { blockNumberRelation } from "../common/utils.ts";
import type { Input, Output, Page, PrimitiveType } from "./types.ts";
import { PageSchema, toMsTimestamp } from "./types.ts";
import {
  fetchNewestPage,
  genImmediatePageRequests,
  genOnDemandPageRequests,
  type PageRange,
  type PageRequest,
} from "../base/page.ts";
import type { PrimitiveFetcher } from "../base/primitive.ts";
import type { RootConversion } from "../base/state.ts";
import type {
  ConfigNetworkType,
  FlattenSyncProtocolIOFor,
  PrimitiveEntry,
  SyncProtocolWithNetwork,
} from "@paima/config";
import {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
} from "@paima/config";
import { Value } from "@sinclair/typebox/value";

export class EvmFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements
    PrimitiveFetcher<
      Input,
      Page,
      GetBlockReturnType<Chain>,
      PrimitiveType,
      | ConfigSyncProtocolType.EVM_RPC_MAIN
      | ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
    PaginatedFetcher<Page> {
  constructor(
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.EVM }
    >,
    readonly client: PublicClient<any, Chain, any, any>,
  ) {
    super(config.syncProtocol.name);
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const isParallel =
      this.config.syncProtocolType === ConfigSyncProtocolType.EVM_RPC_PARALLEL;
    const pageFetcher = (() => {
      if (data.isPresync || isParallel) {
        return genOnDemandPageRequests(
          data.from,
          data.to,
          (page) => this.client.getBlock({ blockNumber: BigInt(page) }),
          blockNumberRelation,
        );
      }
      return genImmediatePageRequests(
        Array.from(
          { length: data.to - data.from + 1 },
          (_, i) => i + data.from,
        ),
        (page) => this.client.getBlock({ blockNumber: BigInt(page) }),
      );
    })();

    // TODO: if we expect multiple primitives per block
    //       it can, depending on the chain, be faster to just download the full block and parse it locally
    const primitives = yield* this.readPrimitives(
      data,
      pageFetcher,
      this.config.primitives,
    );
    const groupedByPage = this.groupByPage(primitives);

    if (isParallel) {
      const [output, lastPage] = yield* all(
        [
          all(
            keysOf(groupedByPage).map(function* (pageJson) {
              const page = Value.Encode(PageSchema, pageJson);
              return {
                raw: yield* call(() => pageFetcher(page)),
                primitives: groupedByPage[pageJson],
              };
            }),
          ),
          // we always need to get the last page in the parallel case
          // so we can use it for pagination
          call(() => pageFetcher(Number(data.to))),
        ],
      );
      return {
        output: output.map((o) => ({
          output: o,
          cleanup: () => {}, // no cleanup required
        })),
        lastPage: {
          own: Number(data.to),
          root: rootConversion.toRootPage({
            primitives: [], // unused in toRootPage
            raw: lastPage,
          }),
        },
      };
    } else {
      const output = yield* all(
        Array.from(
          { length: data.to - data.from + 1 },
          (_, i) => i + data.from,
        ).map(function* (page: Page) {
          const key = Value.Decode(PageSchema, page);
          return {
            raw: yield* call(() => pageFetcher(page)),
            primitives: groupedByPage[key] ?? [],
          };
        }),
      );
      return {
        output: output.map((o) => ({
          output: o,
          cleanup: () => {}, // no cleanup required
        })),
        lastPage: {
          own: Number(data.to),
          root: rootConversion.toRootPage({
            primitives: [], // unused in toRootPage
            raw: (yield* call(() => pageFetcher(Number(data.to)))),
          }),
        },
      };
    }
  }

  @bound
  groupByPage(
    primitives: PrimitiveType[],
  ): Record<EvmRpcPageJson, PrimitiveType[]> {
    return primitives.reduce((acc, primitive) => {
      const key = Value.Decode(
        PageSchema,
        Number(primitive.output.syncProtocol.payload.ownChain.blockNumber),
      );
      (acc[key] ??= []).push(
        primitive,
      );
      return acc;
    }, {} as Record<EvmRpcPageJson, PrimitiveType[]>);
  }

  fetchLogsAndExtractPrimitiveData = function* (
    blockNumber: number,
    client: PublicClient<any, Chain, any, any>,
    primitive: PrimitiveEntry<
      | ConfigSyncProtocolType.EVM_RPC_MAIN
      | ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
    pageRequest: PageRequest<Page, GetBlockReturnType<Chain>>,
  ): Operation<
    PrimitiveType[]
  > {
    const block = yield* call(() => pageRequest(blockNumber));
    const logs = yield* call(() =>
      client.getLogs({
        // TODO We need to correctly pass the ABI here
        // abi: primitive.primitive.abi,
        address: primitive.primitive.contractAddress,
        event: primitive.primitive.abi,
        fromBlock: BigInt(block.number),
        toBlock: BigInt(block.number),
      })
    );

    // TODO What is the correct type?
    const primitiveResponse: FlattenSyncProtocolIOFor<
      | ConfigSyncProtocolType.EVM_RPC_MAIN
      | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
      ConfigPrimitiveType,
      ConfigPrimitivePayloadType
    >[] = logs.map((
      log,
    ) => {
      let payloadType;
      let realAddress;
      let primitiveType;
      switch (primitive.primitive.type) {
        case ConfigPrimitiveType.EvmRpcERC20:
          primitiveType = ConfigPrimitiveType.EvmRpcERC20;
          payloadType = ConfigPrimitivePayloadType.Transfer;
          realAddress = (log.args as any).to as `0x${string}`;
          break;
        case ConfigPrimitiveType.EvmRpcPaimaL2:
          primitiveType = ConfigPrimitiveType.EvmRpcPaimaL2;
          payloadType = ConfigPrimitivePayloadType.Event;
          realAddress = (log.args as any).userAddress as `0x${string}`;
          break;
        default:
          throw new Error("Unknown primitive type");
      }

      const primitiveResponse: PrimitiveType = {
        input: primitive.primitive as any,
        output: {
          payloadType: payloadType as any,
          primitive: primitiveType as any,
          payload: ({
            ...log.args,
            realAddress: {
              type: AddressType.EVM,
              address: realAddress,
            },
          } as any),
          syncProtocol: {
            type: primitive.primitive.type as any,
            name: primitive.primitive.name,
            internal: {},
            payload: ({
              primitiveName: primitive.primitive.name,
              transactionHash: log.transactionHash,
              caip2: "eip155:1",
              // fromAddress: log.address,
              ownChain: {
                blockNumber: Number(block.number),
              },
            } as any),
          },
        },
        primitiveType: primitive.primitive.type,
        payloadType: payloadType as any,
      };
      return primitiveResponse;
    });

    return primitiveResponse;
  };

  @bound
  *readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, GetBlockReturnType<Chain>>,
    primitives: PrimitiveEntry<
      | ConfigSyncProtocolType.EVM_RPC_MAIN
      | ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >[],
  ): Operation<PrimitiveType[]> {
    const client = this.client;
    const allOperations: Operation<PrimitiveType[]>[] = [];

    for (const primitive of primitives) {
      for (let block = data.from; block <= data.to; block++) {
        allOperations.push(
          this.fetchLogsAndExtractPrimitiveData(
            block,
            client,
            primitive,
            pageRequest,
          ),
        );
      }
    }

    return (yield* all(allOperations)).flat();
  }

  @bound
  *getLatestPage(
    knownLastPage: undefined | Page,
  ): Operation<Page> {
    return yield* fetchNewestPage<Page>(
      blockNumberRelation,
      // override Viem's cache logic with out own
      () =>
        call(() =>
          this.client.getBlockNumber({ cacheTime: 0 }).then(Number).then(
            (height) => {
              const config = this.config.syncProtocol;
              if ("confirmationDepth" in config) {
                return height - config.confirmationDepth;
              }
              return height;
            },
          )
        ),
      knownLastPage,
      this.config.syncProtocol.pollingInterval,
    );
  }

  @bound
  previousInterval(nextIntervalStart: Page): PageRange<Page> {
    return this.intervalFromStart(
      nextIntervalStart - this.config.syncProtocol.stepSize - 1,
    );
  }

  @bound
  nextInterval(prevIntervalEnd: Page): PageRange<Page> {
    return this.intervalFromStart(prevIntervalEnd + 1);
  }

  @bound
  intervalFromStart(start: Page): PageRange<Page> {
    return {
      from: start,
      to: start + this.config.syncProtocol.stepSize,
    };
  }
}
