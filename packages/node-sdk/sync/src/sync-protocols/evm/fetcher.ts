import {
  BaseDataFetcher,
  type DataFetched,
  type PaginatedFetcher,
} from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { AbiEvent, Chain, GetBlockReturnType, PublicClient } from "viem";
import type { Operation } from "effection";
import { all, call } from "effection";
import {
  bound,
  type EvmBlockHash,
  type EvmRpcPageJson,
  keysOf,
} from "@effectstream/utils";
import { blockNumberRelation } from "../common/utils.ts";
import type {
  ConfigType,
  Input,
  Output,
  Page,
  PrimitiveEntryType,
  PrimitiveType,
} from "./types.ts";
import { PageSchema } from "./types.ts";
import {
  fetchNewestPage,
  genOnDemandPageRequests,
  type PageRange,
  type PageRequest,
} from "../base/page.ts";
import type { PrimitiveFetcher } from "../base/primitive.ts";
import type { RootConversion } from "../base/state.ts";
import type {
  ConfigNetworkType,
  PrimitiveEntry,
  SyncProtocolWithNetwork,
} from "@effectstream/config";
import type { ConfigSyncProtocolType } from "@effectstream/config";
import { Value } from "@sinclair/typebox/value";

export class EvmFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements
    PrimitiveFetcher<
      Input,
      Page,
      GetBlockReturnType<Chain>,
      PrimitiveType,
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
    PaginatedFetcher<Page> {
  constructor(
    readonly config: ConfigType,
    readonly client: PublicClient<any, Chain, any, any>,
  ) {
    super(config.syncProtocol.name);
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const fetchAllBlocks = this.config.primitives.some(
      (p) => p.primitive.getAllBlockHeaders,
    );

    const pageFetcher = genOnDemandPageRequests(
      data.from,
      data.to,
      (page) => this.client.getBlock({ blockNumber: BigInt(page) }),
      blockNumberRelation,
    );

    const primitives = yield* this.readPrimitives(
      data,
      pageFetcher,
      this.config.primitives,
    );
    const groupedByPage = this.groupByPage(primitives);

    const [output, lastPage] = yield* all(
      [
        all(
          keysOf(groupedByPage).map(function* (pageJson) {
            const page = Value.Encode(PageSchema, pageJson);
            const raw = yield* call(() => pageFetcher(page));
            const blockHashes = [raw.hash] as EvmBlockHash[];
            return {
              raw,
              primitives: groupedByPage[pageJson],
              blockHashes,
            };
          }),
        ),
        // we always need the last page for pagination
        call(() => pageFetcher(Number(data.to))),
      ],
    );

    const allOutputs: Output[] = [];
    for (let page = data.from; page <= data.to; page++) {
      const _output = output.find((o) => o.raw.number === BigInt(page));
      if (_output) {
        allOutputs.push(_output);
      } else if (fetchAllBlocks) {
        const raw = yield* call(() => pageFetcher(page));
        allOutputs.push({
          raw,
          primitives: [],
          blockHashes: [raw.hash] as EvmBlockHash[],
        });
      } else if (page === data.to) {
        allOutputs.push({
          raw: lastPage,
          primitives: [],
          blockHashes: [lastPage.hash] as EvmBlockHash[],
        });
      }
    }

    return {
      output: allOutputs.map((o) => ({
        output: o,
        cleanup: () => {},
      })),
      lastPage: {
        own: Number(data.to),
        ownBlockNumber: Number(data.to),
        root: rootConversion.toRootPage({
          blockHashes: [lastPage.hash] as EvmBlockHash[],
          primitives: [],
          raw: lastPage,
        }),
      },
    };
  }

  @bound
  groupByPage(
    primitives: PrimitiveType[],
  ): Record<EvmRpcPageJson, PrimitiveType[]> {
    return primitives.reduce((acc, primitive) => {
      const key = Value.Decode(
        PageSchema,
        Number(primitive.syncProtocol.blockNumber),
      );
      (acc[key] ??= []).push(
        primitive,
      );
      return acc;
    }, {} as Record<EvmRpcPageJson, PrimitiveType[]>);
  }

  fetchLogsAndExtractPrimitiveData = function* (
    fromBlock: bigint,
    toBlock: bigint,
    client: PublicClient<any, Chain, any, any>,
    primitiveEntry: PrimitiveEntryType,
    abi: AbiEvent,
    pageRequest: PageRequest<Page, GetBlockReturnType<Chain>>,
  ): Operation<
    PrimitiveType[]
  > {
    // Fetch range of event-logs
    const logs = yield* call(() =>
      client.getLogs({
        address: primitiveEntry.primitive.contractAddress as `0x${string}`,
        event: abi,
        fromBlock,
        toBlock,
        strict: true,
      })
    );

    // Create PrimitiveType for each event.
    const primitiveResponses: PrimitiveType[] = [];
    for (const log of logs) {
      // const block = yield* call(() => pageRequest(Number(log.blockNumber)));
      const args = (log as unknown as {
        args: Record<string, any>;
      }).args;
      const primitiveResponse: PrimitiveType = {
        syncProtocol: {
          name: primitiveEntry.syncProtocol,
          blockNumber: Number(log.blockNumber),
          transactionHash: log.transactionHash,
          transactionIndex: log.transactionIndex,
          contractAddress: log.address,
          logIndex: log.logIndex,
        },
        primitive: primitiveEntry.primitive.name,
        output: {
          payloadType: abi.name,
          payload: args,
        },
      };

      primitiveResponses.push(primitiveResponse);
    }

    return primitiveResponses;
  };

  @bound
  *readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, GetBlockReturnType<Chain>>,
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.EVM_RPC_PARALLEL }
    >[],
  ): Operation<PrimitiveType[]> {
    const client = this.client;
    const allOperations: Operation<PrimitiveType[]>[] = [];

    const fromBlock = yield* call(() => pageRequest(data.from));
    const toBlock = yield* call(() => pageRequest(data.to));
    for (const primitive of primitiveEntries) {
      if (Array.isArray(primitive.primitive.abi)) {
        const abis = primitive.primitive.abi as AbiEvent[];
        for (const abi of abis) {
          allOperations.push(
            this.fetchLogsAndExtractPrimitiveData(
              fromBlock.number,
              toBlock.number,
              client,
              primitive,
              abi,
              pageRequest,
            ),
          );
        }
      } else {
        allOperations.push(
          this.fetchLogsAndExtractPrimitiveData(
            fromBlock.number,
            toBlock.number,
            client,
            primitive,
            primitive.primitive.abi as AbiEvent,
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
