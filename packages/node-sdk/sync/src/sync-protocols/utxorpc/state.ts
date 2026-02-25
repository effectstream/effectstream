import { applyDelay } from "../common/utils.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { getPage } from "@effectstream/db";
import type { PoolClient } from "pg";
import { bound, type TimestampMs } from "@effectstream/utils";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { UtxoRpcFetcher } from "./fetcher.ts";
import type { ConfigType, Input, Output, Page } from "./types.ts";
import { chainPointRelation } from "./types.ts";
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
    readonly config: ConfigType,
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
      yield* call(() => this.fetcher.startAsync({
        slot: this.config.syncProtocol.startChainPoint.slot,
        hash: this.config.syncProtocol.startChainPoint.hash,
      }));
      return;
    }
    yield* call(() =>
      this.fetcher.startAsync({
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
    return applyDelay(
      Number(data.raw.timestamp * 1000n),
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {  
    // Get the value of the latest block height.
    const tipHeight = yield* call(() => this.fetcher.lastHeight());
    if (!tipHeight) {
      return undefined;
    }

    // TODO This might be wrong, we are using block heights - not slots (?)
    const startHeight = this.lastPage?.own.height ?? this.config.syncProtocol.startChainPoint.slot - 1;

    if (BigInt(startHeight) >= tipHeight) {
      return undefined;
    }

    // TODO We need to check how to handle the presync process.
    // const storedBlocks = yield* this.fetcher.client.storedBlocks(
    //   this.lastPage?.own.height,
    // );
    // if (storedBlocks.from.slot < this.config.syncProtocol.startSlot) {
    //   return {
    //     from: storedBlocks.from.height,
    //     to: Math.max(
    //       storedBlocks.to.height,
    //       // TODO: this should be a height and not a slot number
    //       //       either we need to resolve the actual block at that slot
    //       //       (blocked by https://github.com/utxorpc/spec/issues/148)
    //       //       or we need to guess and refine if wrong
    //       this.config.syncProtocol.startSlot - 1,
    //     ),
    //     isPresync: true,
    //   };
    // }
    
    // TODO Is this correct?
    // EVM Handles this with `genInputRange`
    const from = startHeight + 1;
    const to = tipHeight ? Math.min(
      from + 1,
      Number(tipHeight),
    ) : from + 1;

    return {
      from,
      to,
      isPresync: false, // TODO: handle presync
    };
  }

  @bound
  override toPage(
    input: Input,
    data: Output[],
  ): Page {
    return {
      slot: Number(data[data.length - 1].raw.header!.slot),
      height: Number(data[data.length - 1].raw.header!.height),
      hash: Buffer.from(data[data.length - 1].raw.header!.hash).toString(
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
      block_number: Number(ourOutput.raw.header!.height),
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
    config: ConfigType,
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
