import { call, type Operation } from "effection";
import { bound, type TimestampMs } from "@effectstream/utils";
import type { PoolClient } from "pg";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Input, Output, Page } from "./types.ts";
import { pageRelation } from "./types.ts";
import type { AvailFetcher } from "./fetcher.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@effectstream/config";
import { getPage } from "@effectstream/db";
import { AvailClient } from "./AvailClient.ts";
import { applyDelay } from "../common/utils.ts";

export class AvailSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  AvailFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage> | undefined,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.AVAIL }
    >,
    fetcher: AvailFetcher,
    public readonly client: AvailClient,
    dbConn: PoolClient,
  ) {
    super(
      config.syncProtocol.name,
      lastPage,
      fetcher,
      pageRelation,
      dbConn,
    );
  }

  @bound
  override toPage(input: Input, data: Output[]): Page {
    const lastBlock = data[data.length - 1];
    return {
      height: lastBlock.raw.number,
      hash: lastBlock.raw.hash,
    };
  }

  @bound
  override toRootPage(data: Output): RootPage {
    // Avail headers include `received_at` (sec). Use it as the chain page.
    return applyDelay(
      data.raw.received_at * 1000,
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override toRootOutput(_data: Output): RootOutput {
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    const latestHeight = yield* call(() => this.client.getLatestBlockHeight());
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
      isPresync: false,
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
      block_number: ourOutput.raw.number,
      blockHash: ourOutput.raw.hash,
    }];
    rootOutput.blockInfo.push(...blockInfo);
    rootOutput.primitives.push(...primitives);
  }

  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    return {
      own: { height: data.raw.number, hash: data.raw.hash },
      ownBlockNumber: data.raw.number,
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
      { networkType: ConfigNetworkType.AVAIL }
    >,
    fetcher: AvailFetcher,
  ): Operation<AvailSyncState> {
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new AvailSyncState(
      page,
      config,
      fetcher,
      new AvailClient(
        config.syncProtocol.rpc,
        config.syncProtocol.lightClient,
      ),
      dbConn,
    );
  }
}
