import {
  BaseDataFetcher,
  type DataFetched,
  type PaginatedFetcher,
} from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Operation } from "effection";
import { all, call, until } from "effection";
import { bound, type NtpBlockHash, type NtpPageJson } from "@effectstream/utils";
import { blockNumberRelation } from "../common/utils.ts";
import type { Input, Output, Page, PrimitiveType } from "./types.ts";
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
  PrimitiveEntry,
  SyncProtocolWithNetwork,
} from "@effectstream/config";
import type { ConfigSyncProtocolType } from "@effectstream/config";
import { NtpTimeSync } from "ntp-time-sync";

export class NtpFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements
    PrimitiveFetcher<
      Input,
      Page,
      { blockNumber: number; timestamp: bigint; hash: string },
      PrimitiveType,
      ConfigSyncProtocolType.NTP_MAIN
    >,
    PaginatedFetcher<Page> {
  readonly ntpTimeSync: NtpTimeSync;
  constructor(
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.NTP }
    >,
  ) {
    super(config.syncProtocol.name);

    if (config.network.servers && config.network.servers.length) {
      // A configured deployment gets a dedicated instance. ntp-time-sync 0.6
      // owns its cache per instance, so a prior default singleton cannot make
      // this first query reuse public-pool data.
      this.ntpTimeSync = new NtpTimeSync({
        servers: [...config.network.servers],
      });
    } else {
      // Preserve the existing absent/empty configuration behavior and the
      // dependency's default public pools, sampling, polling and timeout values.
      this.ntpTimeSync = NtpTimeSync.getInstance();
    }
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const pageFetcher = (() => {
      if (data.isPresync) {
        return genOnDemandPageRequests(
          data.from,
          data.to,
          async (page) => {
            const diff = BigInt(this.config.network.blockTimeMS * page);
            const timestamp = BigInt(this.config.network.startTime) + diff;
            return {
              blockNumber: page,
              timestamp,
              hash: `0x${timestamp.toString(16)}`,
            };
          },
          blockNumberRelation,
        );
      }
      return genImmediatePageRequests(
        Array.from(
          { length: data.to - data.from + 1 },
          (_, i) => i + data.from,
        ),
        async (page) => {
          const diff = BigInt(this.config.network.blockTimeMS * page);
          const timestamp = BigInt(this.config.network.startTime) + diff;
          return {
            blockNumber: page,
            timestamp,
            hash: `0x${timestamp.toString(16)}`,
          };
        },
      );
    })();

    const output = yield* all(
      Array.from(
        { length: data.to - data.from + 1 },
        (_, i) => i + data.from,
      ).map(function* (page: Page) {
        const raw = yield* call(() => pageFetcher(page));
        const blockHashes = [raw.hash] as NtpBlockHash[];
        return {
          raw,
          blockHashes,
        };
      }),
    );
    return {
      output: output.map((o) => ({
        output: o,
        cleanup: () => {}, // no cleanup required
      })),
      lastPage: {
        ownBlockNumber: Number(data.to),
        own: Number(data.to),
        root: rootConversion.toRootPage({
          blockHashes: [] as NtpBlockHash[],
          raw: (yield* call(() => pageFetcher(Number(data.to)))),
        }),
      },
    };
  }

  @bound
  groupByPage(
    primitives: PrimitiveType[],
  ): Record<NtpPageJson, PrimitiveType[]> {
    // Not used in NTP
    return {};
  }

  @bound
  *readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, { timestamp: bigint; hash: string }>,
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.NTP_MAIN }
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
        const result = yield* until(self.ntpTimeSync.getTime());
        if (Math.abs(result.offset) > 5000) {
          console.error(
            `NTP offset is higher than 5[s]. Please check your NTP server & system time configuration.
NTP time: ${result.now}
Local time: ${new Date()}
Offset [ms]: ${result.offset}`,
          );
        }
        const diff = result.now.getTime() - self.config.network.startTime;
        const blockNumber = Math.floor(diff / self.config.network.blockTimeMS);
        return blockNumber;
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
