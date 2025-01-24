import { BaseDataFetcher, type DataFetched } from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Operation } from "effection";
import { all, call } from "effection";
import { bound, keysOf } from "@paima/utils";
import type { Input, Output, Page, PrimitiveType } from "./types.ts";
import { chainPointRelation } from "./types.ts";
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
import type { ConfigSyncProtocolType } from "@paima/config";
import type { cardano } from "@utxorpc/spec";
import type { BufferedRpc } from "./BufferedRpc.ts";

export class UtxoRpcFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements PrimitiveFetcher<Input, Page, cardano.Block, PrimitiveType> {
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
    const isParallel = true; // only parallel option for utxoRPC
    const pageFetcher = (() => {
      if (data.isPresync || isParallel) {
        return genOnDemandPageRequests(
          data.from,
          data.to,
          (page) => this.client.fetchBlock(page),
          chainPointRelation,
        );
      }
      return genImmediatePageRequests(
        Array.from(
          { length: data.to.slot - data.from.slot + 1 },
          (_, i) => i + data.from.slot,
        ),
        (page) => this.client.fetchBlock(page),
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
            keysOf(groupedByPage).map(function* (page) {
              return {
                raw: yield* call(pageFetcher(page)),
                primitives: groupedByPage[page],
              };
            }),
          ),
          // we always need to get the last page in the parallel case
          // so we can use it for pagination
          call(pageFetcher(Number(data.to))),
        ],
      );
      return {
        output,
        lastPage: {
          own: Number(data.to),
          root: rootConversion.toRootPage({
            primitives: [],
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
          return {
            raw: yield* call(pageFetcher(page)),
            primitives: groupedByPage[page] ?? [],
          };
        }),
      );
      return {
        output,
        lastPage: {
          own: Number(data.to),
          root: rootConversion.toRootPage({
            primitives: [],
            raw: (yield* call(pageFetcher(Number(data.to)))),
          }),
        },
      };
    }
  }

  @bound
  groupByPage(primitives: PrimitiveType[]): Record<Page, PrimitiveType[]> {
    return primitives.reduce((acc, primitive) => {
      (acc[Number(primitive.block.number)] ??= []).push(primitive);
      return acc;
    }, {} as Record<Page, PrimitiveType[]>);
  }

  @bound
  *readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, GetBlockReturnType<Chain>>,
  ): Operation<PrimitiveType[]> {
    // TODO: need to have multiple primitives as part of the config
    // TODO: dynamic primitives

    const primitives = [] as (() => Operation<PrimitiveType>)[];
    for (let i = data.from; i <= data.to; i++) {
      if (Math.random() < 0.5) {
        primitives.push(function* () {
          const block = yield* call(pageRequest(i));
          return {
            value: Math.random(),
            block,
            timestamp: toMsTimestamp(block.timestamp),
          };
        });
      }
    }
    return yield* all(primitives.map((p) => p()));
  }

  @bound
  override *getLatestPage(
    knownLastPage: undefined | Page,
  ): Operation<Page> {
    // TODO: implement `confirmationDepth`
    return yield* fetchNewestPage<Page>(
      chainPointRelation,
      // override Viem's cache logic with out own
      () => call(this.client.getBlockNumber({ cacheTime: 0 }).then(Number)),
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
