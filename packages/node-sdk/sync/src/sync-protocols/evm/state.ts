import { applyDelay, blockNumberRelation } from "../common/utils.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { getPage } from "@paima/db";
import type { PoolClient } from "pg";
import { bound } from "@paima/utils";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { EvmFetcher } from "./fetcher.ts";
import { genInputRange } from "../common/page-helpers.ts";
import type { Input, Output, Page } from "./types.ts";
import { toMsTimestamp } from "./types.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@paima/config";
import { ConfigSyncProtocolType } from "@paima/config";

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
  ) {
    super(lastPage, fetcher, blockNumberRelation);
  }

  @bound
  override toRootOutput(data: Output): RootOutput {
    return {
      blockHashes: data.blockHashes.map((h) => ({
        source: this.config.syncProtocol.name,
        blockHashes: h,
      })),
      blockNumber: Number(data.raw.number),
      timestamp: this.toRootPage(data),
      primitives: data.primitives.map((p) => ({
        ...p,
        source: this.config.syncProtocol.name,
      })),
    };
  }

  @bound
  override toRootPage(data: Output): RootPage {
    if (this.config.syncProtocol.type === ConfigSyncProtocolType.EVM_RPC_MAIN) {
      return toMsTimestamp(data.raw.timestamp);
    }

    return applyDelay(
      toMsTimestamp(data.raw.timestamp),
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    return yield* genInputRange(
      this as EvmSyncState,
      1, // TODO: do we skip block 0 for EVM?
      {
        name: this.config.syncProtocol.name,
        startPage: this.config.syncProtocol.startBlockHeight,
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
    const blockHashes = ourOutput.blockHashes.map((h) => ({
      source: this.config.syncProtocol.name,
      blockHashes: h,
    }));
    rootOutput.primitives.push(...primitives);
    rootOutput.blockHashes.push(...blockHashes);
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
    // TODO: this should instead be parsed with typebox with default values
    const page = result as any;
    return new EvmSyncState(
      page,
      config,
      fetcher,
    );
  }
}
