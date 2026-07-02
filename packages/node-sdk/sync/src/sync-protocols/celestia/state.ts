import { call, type Operation } from "effection";
import { bound } from "@effectstream/utils";
import type { PoolClient } from "pg";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Input, Output, Page } from "./types.ts";
import { pageRelation } from "./types.ts";
import type { CelestiaFetcher } from "./fetcher.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@effectstream/config";
import { getPage } from "@effectstream/db";
import { CelestiaClient } from "./CelestiaClient.ts";
import { applyDelay } from "../common/utils.ts";
import { bufferAtCap } from "../common/page-helpers.ts";

export class CelestiaSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  CelestiaFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage> | undefined,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.CELESTIA }
    >,
    fetcher: CelestiaFetcher,
    public readonly client: CelestiaClient,
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
  override toPage(_input: Input, data: Output[]): Page {
    const lastBlock = data[data.length - 1];
    return {
      height: lastBlock.height,
      hash: lastBlock.hash,
    };
  }

  @bound
  override toRootPage(data: Output): RootPage {
    // Celestia headers use ISO 8601 timestamps; convert to ms.
    const timestampMs = new Date(data.timestamp).getTime();
    return applyDelay(timestampMs, this.config.syncProtocol.delayMs);
  }

  @bound
  override toRootOutput(_data: Output): RootOutput {
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    const latestHeight = yield* call(() =>
      this.client.getLatestBlockHeight()
    );
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
      block_number: ourOutput.height,
      blockHash: ourOutput.hash,
    }];
    rootOutput.blockInfo.push(...blockInfo);
    rootOutput.primitives.push(...primitives);
  }

  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    return {
      own: { height: data.height, hash: data.hash },
      ownBlockNumber: data.height,
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
      { networkType: ConfigNetworkType.CELESTIA }
    >,
    fetcher: CelestiaFetcher,
  ): Operation<CelestiaSyncState> {
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new CelestiaSyncState(
      page,
      config,
      fetcher,
      new CelestiaClient(config.network.rpcUrl),
      dbConn,
    );
  }
}
