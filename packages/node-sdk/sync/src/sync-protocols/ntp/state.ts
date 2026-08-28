import { blockNumberRelation } from "../common/utils.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { getPage } from "@effectstream/db";
import type { PoolClient } from "pg";
import { bound, type NtpBlockNumber } from "@effectstream/utils";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { NtpFetcher } from "./fetcher.ts";
import { bufferAtCap, genInputRange } from "../common/page-helpers.ts";
import type { Input, Output, Page } from "./types.ts";
import { toMsTimestamp } from "./types.ts";
import {
  type ConfigNetworkType,
  type SyncProtocolWithNetwork,
} from "@effectstream/config";

const START_BLOCK_HEIGHT_PROVENANCE = Symbol.for(
  "@effectstream/config/start-block-height-provenance",
);

export class NtpSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  NtpFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage>,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.NTP }
    >,
    fetcher: NtpFetcher,
    dbConn: PoolClient,
  ) {
    super(
      config.syncProtocol.name,
      lastPage,
      fetcher,
      blockNumberRelation,
      dbConn,
    );
  }

  @bound
  override toRootOutput(data: Output): RootOutput {
    return {
      blockInfo: data.blockHashes.map((h) => ({
        protocol_name: this.config.syncProtocol.name,
        block_number: Number(data.raw.blockNumber),
        blockHash: h,
      })),
      blockNumber: Number(data.raw.blockNumber),
      timestamp: this.toRootPage(data),
      resumePages: [],
      primitives: [],
    };
  }

  @bound
  override toRootPage(data: Output): RootPage {
    return toMsTimestamp(data.raw.timestamp);
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    const resolvedStart = this.config.syncProtocol.startBlockHeight as NtpBlockNumber;
    const provenance = (this.config as typeof this.config & {
      [START_BLOCK_HEIGHT_PROVENANCE]?: "latest" | "explicit";
    })[START_BLOCK_HEIGHT_PROVENANCE];
    const inclusiveGenesis =
      provenance === "latest"
        ? resolvedStart
        : 1 as NtpBlockNumber;
    return yield* genInputRange(
      this as NtpSyncState,
      inclusiveGenesis,
      {
        name: this.config.syncProtocol.name,
        startPage: resolvedStart,
      },
      this.getNamespace(),
    );
  }

  @bound
  override toPage(
    input: Input,
    data: Output[],
  ): Page {
    return Number(input.to);
  }

  @bound
  override mergeDatum(
    ourOutput: Output,
    rootOutput: RootOutput,
  ): void {
    throw new Error("Only parallel chains merge into root");
  }

  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    const block = Number(data.raw.blockNumber);
    return {
      own: block,
      ownBlockNumber: block,
      root: this.toRootPage(data),
    };
  }

  @bound
  override getNamespace(): string[] {
    return [this.config.network.name, this.config.syncProtocol.name];
  }

  static *restoreState(
    dbConn: PoolClient,
    config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.NTP }
    >,
    fetcher: NtpFetcher,
  ): Operation<NtpSyncState> {
    // TODO: move this DB query into page-helpers?
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page: any = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new NtpSyncState(
      page,
      config,
      fetcher,
      dbConn,
    );
  }
}
