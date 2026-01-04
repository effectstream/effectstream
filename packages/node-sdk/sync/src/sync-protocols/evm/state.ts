import { applyDelay, blockNumberRelation } from "../common/utils.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { getPage } from "@effectstream/db";
import type { PoolClient } from "pg";
import { bound, type EvmBlockNumber } from "@effectstream/utils";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { EvmFetcher } from "./fetcher.ts";
import { genInputRange } from "../common/page-helpers.ts";
import type { Input, Output, Page } from "./types.ts";
import { toMsTimestamp } from "./types.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@effectstream/config";

export class EvmSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  EvmFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage>,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.EVM }
    >,
    fetcher: EvmFetcher,
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
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override toRootPage(data: Output): RootPage {
    return applyDelay(
      toMsTimestamp(data.raw.timestamp),
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    return yield* genInputRange(
      this as EvmSyncState,
      this.config.syncProtocol.startBlockHeight as EvmBlockNumber,
      {
        name: this.config.syncProtocol.name,
        startPage: this.config.syncProtocol.startBlockHeight as EvmBlockNumber,
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
    const primitives = ourOutput.primitives.map((p) => ({
      ...p,
      source: this.config.syncProtocol.name,
    }));
    const blockInfo = ourOutput.blockHashes.map((h) => ({
      protocol_name: this.config.syncProtocol.name,
      block_number: Number(ourOutput.raw.number),
      blockHash: h,
    }));
    rootOutput.primitives.push(...primitives);
    rootOutput.blockInfo.push(...blockInfo);
  }

  @bound
  override getNamespace(): string[] {
    return [this.config.network.name, this.config.syncProtocol.name];
  }

  static *restoreState(
    dbConn: PoolClient,
    config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.EVM }
    >,
    fetcher: EvmFetcher,
  ): Operation<EvmSyncState> {
    // TODO: move this DB query into page-helpers?
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page: any = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new EvmSyncState(
      page,
      config,
      fetcher,
      dbConn,
    );
  }
}
