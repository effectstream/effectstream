import {
  BaseDataFetcher,
  type DataFetched,
  type PaginatedFetcher,
} from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Chain, GetBlockReturnType, PublicClient } from "viem";
import type { Operation } from "effection";
import { all, call } from "effection";
import { bound, type EvmRpcPageJson, keysOf } from "@paima/utils";
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
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@paima/config";
import { ConfigSyncProtocolType } from "@paima/config";
import { Value } from "@sinclair/typebox/value";

export class EvmFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements
    PrimitiveFetcher<Input, Page, GetBlockReturnType<Chain>, PrimitiveType>,
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
    const primitives = yield* this.readPrimitives(data, pageFetcher);
    const groupedByPage = this.groupByPage(primitives);

    if (isParallel) {
      const [output, lastPage] = yield* all(
        [
          all(
            keysOf(groupedByPage).map(function* (pageJson) {
              const page = Value.Decode(PageSchema, pageJson);
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
          const key = Value.Encode(PageSchema, page);
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
      const key = Value.Encode(
        PageSchema,
        Number(primitive.output.syncProtocol.payload.ownChain.blockNumber),
      );
      (acc[key] ??= []).push(
        primitive,
      );
      return acc;
    }, {} as Record<EvmRpcPageJson, PrimitiveType[]>);
  }

  @bound
  *readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, GetBlockReturnType<Chain>>,
  ): Operation<PrimitiveType[]> {
    // TODO: use real primitives (blocked on hardhat contract deployment working)
    // TODO: dynamic primitives

    const primitives = [] as (() => Operation<PrimitiveType>)[];
    for (let i = data.from; i <= data.to; i++) {
      if (Math.random() < 0.5) {
        primitives.push(function* () {
          const block = yield* call(() => pageRequest(i));
          return {
            // TODO: real type later
            value: Math.random(),
            block,
            timestamp: toMsTimestamp(block.timestamp),
            output: {
              syncProtocol: {
                payload: {
                  ownChain: {
                    blockNumber: Number(block.number),
                  },
                },
              },
            },
          } as any;
        });
      }
    }
    return yield* all(primitives.map((p) => p()));
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
