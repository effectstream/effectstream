import {
  BaseDataFetcher,
  type DataFetched,
  type PaginatedFetcher,
} from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Operation } from "effection";
import { bound } from "@effectstream/utils";
import { blockNumberRelation } from "../common/utils.ts";
import type { Input, Output, Page, PrimitiveType } from "./types.ts";
import {
  fetchNewestPage,
  type PageRange,
  type PageRequest,
} from "../base/page.ts";
import type { PrimitiveFetcher } from "../base/primitive.ts";
import type { OutputAndCleanup, RootConversion } from "../base/state.ts";
import {
  ConfigSyncProtocolType,
  type ConfigNetworkType,
  type PrimitiveEntry,
  type SyncProtocolWithNetwork,
} from "@effectstream/config";
import { TestChainControl } from "./control.ts";

type TestConfig = Extract<
  SyncProtocolWithNetwork,
  { networkType: ConfigNetworkType.TEST }
>;

type TestEvent = { atBlock: number; payload: Record<string, unknown> };

/**
 * Synthetic chain fetcher. Blocks are computed arithmetically (no RPC):
 *   timestamp(page) = startTime + blockTimeMS * page
 * The chain tip comes from {@link TestChainControl} when set (deterministic
 * tests), otherwise from the wall clock. Configured `events` are emitted as
 * primitives when their `atBlock` is reached.
 */
export class TestFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements
    PrimitiveFetcher<
      Input,
      Page,
      { blockNumber: number; timestamp: bigint; hash: string },
      PrimitiveType,
      ConfigSyncProtocolType.TEST_PARALLEL
    >,
    PaginatedFetcher<Page> {
  constructor(
    readonly config: TestConfig,
  ) {
    super(config.syncProtocol.name);
  }

  private blockOf(page: Page): Output["raw"] {
    const timestamp = BigInt(this.config.network.startTime) +
      BigInt(this.config.network.blockTimeMS) * BigInt(page);
    return {
      blockNumber: page,
      timestamp,
      hash: `0x${timestamp.toString(16)}`,
    };
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    // Events are declared on the (parallel) sync protocol config. The primitive
    // instance name to tag them with is the first declared primitive's id.
    const events: TestEvent[] =
      (this.config.syncProtocol as { events?: TestEvent[] }).events ?? [];
    const primitiveId = this.config.primitives[0]?.id;

    const output: OutputAndCleanup<Output>[] = [];
    for (let page = data.from; page <= data.to; page++) {
      const raw = this.blockOf(page);
      const primitives: PrimitiveType[] = [];
      if (primitiveId != null) {
        for (const ev of events) {
          if (ev.atBlock === page) {
            primitives.push({
              syncProtocol: {
                name: ConfigSyncProtocolType.TEST_PARALLEL,
                blockNumber: page,
                transactionHash: `0x${page.toString(16)}`,
                contractAddress: "0x0",
              },
              primitive: primitiveId,
              output: { payloadType: "test-event", payload: ev.payload },
            });
          }
        }
      }
      output.push({
        output: { raw, primitives, blockHashes: [raw.hash] },
        cleanup: () => {},
      });
    }

    return {
      output,
      lastPage: {
        own: Number(data.to),
        ownBlockNumber: Number(data.to),
        root: rootConversion.toRootPage({
          raw: this.blockOf(Number(data.to)),
          primitives: [],
          blockHashes: [],
        }),
      },
    };
  }

  @bound
  groupByPage(
    _primitives: PrimitiveType[],
  ): Record<string, PrimitiveType[]> {
    // Primitives are attached inline in readData; not used.
    return {};
  }

  @bound
  *readPrimitives(
    _data: Input,
    _pageRequest: PageRequest<Page, { timestamp: bigint; hash: string }>,
    _primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.TEST_PARALLEL }
    >[],
  ): Operation<PrimitiveType[]> {
    return [];
  }

  @bound
  *getLatestPage(
    knownLastPage: undefined | Page,
  ): Operation<Page> {
    const self = this;
    return yield* fetchNewestPage<Page>(
      blockNumberRelation,
      function* (): Operation<Page> {
        const manual = TestChainControl.getTip(self.config.syncProtocol.name);
        if (manual != null) return manual;
        const diff = Date.now() - self.config.network.startTime;
        return Math.floor(diff / self.config.network.blockTimeMS);
      },
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
