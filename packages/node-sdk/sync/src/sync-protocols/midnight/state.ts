import { call, type Operation } from "effection";
import { bound, type TimestampMs } from "@effectstream/utils";
import type { PoolClient } from "pg";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Input, Output, Page } from "./types.ts";
import { pageRelation } from "./types.ts";
import type { MidnightFetcher } from "./fetcher.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@effectstream/config";
import { getPage } from "@effectstream/db";
import { MidnightClient } from "./MidnightClient.ts";
import { applyDelay } from "../common/utils.ts";
import { bufferAtCap } from "../common/page-helpers.ts";

type LatestBlock = {
  block: {
    height: number;
  };
};

export class MidnightSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  MidnightFetcher
> {
  private readonly url: string;

  constructor(
    lastPage: LastPage<Page, RootPage> | undefined,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.MIDNIGHT }
    >,
    fetcher: MidnightFetcher,
    public readonly client: MidnightClient,
    dbConn: PoolClient,
  ) {
    super(
      config.syncProtocol.name,
      lastPage,
      fetcher,
      pageRelation,
      dbConn,
    );
    this.url = config.syncProtocol.indexer;
  }

  @bound
  override toPage(input: Input, data: Output[]): Page {
    const lastBlock = data[data.length - 1];
    return {
      height: lastBlock.raw.height,
      hash: lastBlock.raw.hash,
    };
  }

  @bound
  override toRootPage(data: Output): RootPage {
    const time = data.raw.timestamp as unknown as TimestampMs;
    return applyDelay(
      time,
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override toRootOutput(data: Output): RootOutput {
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    const latestBlockResult = yield* call(() => this.client.fetchLatestBlock());
    const latestHeight = latestBlockResult.block.height;

    const startHeight = this.lastPage?.own.height ??
      this.config.syncProtocol.startBlockHeight - 1;

    if (startHeight >= latestHeight) {
      return undefined;
    }

    const from = startHeight + 1;
    const to = Math.min(
      from + this.config.syncProtocol.stepSize - 1,
      latestHeight,
    );

    return {
      from,
      to,
      isPresync: false, // TODO: handle presync
    };
  }

  @bound
  override mergeDatum(ourOutput: Output, rootOutput: RootOutput): void {
    const primitives = ourOutput.primitives.map((p) => ({
      ...p,
      source: this.config.syncProtocol.name,
    }));
    const blockInfo = [{
      protocol_name: this.config.syncProtocol.name,
      block_number: ourOutput.raw.height,
      blockHash: ourOutput.raw.hash,
    }];
    rootOutput.blockInfo.push(...blockInfo);
    rootOutput.primitives.push(...primitives);
  }

  @bound
  override getNamespace(): string[] {
    return [this.config.network.name, this.config.syncProtocol.name];
  }

  static *restoreState(
    dbConn: PoolClient,
    config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.MIDNIGHT }
    >,
    fetcher: MidnightFetcher,
  ): Operation<MidnightSyncState> {
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new MidnightSyncState(
      page,
      config,
      fetcher,
      // TODO: The urls should be part of the config.
      new MidnightClient(
        config.syncProtocol.indexer,
        config.syncProtocol.indexerWS ??
          "ws://127.0.0.1:8088/api/v3/graphql/ws",
      ),
      dbConn,
    );
  }
}
