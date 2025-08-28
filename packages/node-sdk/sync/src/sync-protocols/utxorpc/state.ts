import { applyDelay } from "../common/utils.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { getPage } from "@paima/db";
import type { PoolClient } from "pg";
import { bound, type TimestampMs } from "@paima/utils";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { UtxoRpcFetcher } from "./fetcher.ts";
import type { Input, Output, Page } from "./types.ts";
import { chainPointRelation } from "./types.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@paima/config";
import { ConfigSyncProtocolType } from "@paima/config";
import { Buffer } from "node:buffer";

export class UtxoRpcSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  UtxoRpcFetcher
> {
  constructor(
    lastPage: undefined | LastPage<Page, RootPage>,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.CARDANO }
    >,
    fetcher: UtxoRpcFetcher,
    dbConn: PoolClient,
  ) {
    super(
      config.syncProtocol.name,
      lastPage,
      fetcher,
      chainPointRelation,
      dbConn,
    );
  }

  @bound
  override *startAsync(): Operation<void> {
    if (this.lastPage == null) {
      // TODO: get startSlot if lastPage doesn't exist
      // problem: utxorpc "fetchBlock" requires a ChainPoint
      // see: https://github.com/utxorpc/spec/issues/148
      yield* call(() => this.fetcher.client.start(undefined));
    }
    yield* call(() =>
      this.fetcher.client.start({
        slot: this.lastPage!.own.slot,
        hash: this.lastPage!.own.hash,
      })
    );
  }

  @bound
  override toRootOutput(data: Output): RootOutput {
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override toRootPage(data: Output): RootPage {
    if (
      this.config.syncProtocol.type ===
        ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL
    ) {
      return data.raw.timestamp;
    }

    return applyDelay(
      data.raw.timestamp,
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    const storedBlocks = yield* this.fetcher.client.storedBlocks(
      this.lastPage?.own.height,
    );
    if (storedBlocks.from.slot < this.config.syncProtocol.startSlot) {
      return {
        from: storedBlocks.from.height,
        to: Math.max(
          storedBlocks.to.height,
          // TODO: this should be a height and not a slot number
          //       either we need to resolve the actual block at that slot
          //       (blocked by https://github.com/utxorpc/spec/issues/148)
          //       or we need to guess and refine if wrong
          this.config.syncProtocol.startSlot - 1,
        ),
        isPresync: true,
      };
    }
    return {
      from: storedBlocks.from.height,
      to: storedBlocks.to.height,
      isPresync: false,
    };
  }

  @bound
  override toPage(
    input: Input,
    data: Output[],
  ): Page {
    return {
      slot: Number(data[data.length - 1].raw.block.header!.slot),
      height: Number(data[data.length - 1].raw.block.header!.height),
      hash: Buffer.from(data[data.length - 1].raw.block.header!.hash).toString(
        "hex",
      ),
    };
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
      block_number: Number(ourOutput.raw.block.header!.height),
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
      { networkType: ConfigNetworkType.CARDANO }
    >,
    fetcher: UtxoRpcFetcher,
  ): Operation<UtxoRpcSyncState> {
    // TODO: move this DB query into page-helpers?
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new UtxoRpcSyncState(
      page,
      config,
      fetcher,
      dbConn,
    );
  }
}
