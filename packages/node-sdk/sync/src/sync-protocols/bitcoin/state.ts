import { applyDelay, blockNumberRelation } from "../common/utils.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { getPage } from "@effectstream/db";
import type { PoolClient } from "pg";
import { bound } from "@effectstream/utils";
import {
  type LastPage,
  SyncState,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { BitcoinFetcher } from "./fetcher.ts";
import {
  toMsTimestamp,
  type Input,
  type Output,
  type Page,
} from "./types.ts";
import { bufferAtCap, genInputRange } from "../common/page-helpers.ts";
import type {
  ConfigNetworkType,
  SyncProtocolWithNetwork,
} from "@effectstream/config";

export class BitcoinSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  BitcoinFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage> | undefined,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.BITCOIN }
    >,
    fetcher: BitcoinFetcher,
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
      blockNumber: Number(data.raw.height),
      timestamp: this.toRootPage(data),
      blockInfo: data.blockHashes.map((hash) => ({
        protocol_name: this.config.syncProtocol.name,
        block_number: Number(data.raw.height),
        blockHash: hash,
      })),
      resumePages: [],
      primitives: data.primitives.map((primitive) => ({
        ...primitive,
        source: this.config.syncProtocol.name,
      })),
    };
  }

  @bound
  override toRootPage(data: Output): RootPage {
    return applyDelay(
      toMsTimestamp(data.raw.time),
      this.config.syncProtocol.delayMs ?? 0,
    );
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    return yield* genInputRange(
      this as BitcoinSyncState,
      this.config.syncProtocol.startBlockHeight as Page,
      {
        name: this.config.syncProtocol.name,
        startPage: this.config.syncProtocol.startBlockHeight as Page,
      },
      this.getNamespace(),
    );
  }

  @bound
  override toPage(
    input: Input,
    _data: Output[],
  ): Page {
    return input.to;
  }

  @bound
  override mergeDatum(
    ourOutput: Output,
    rootOutput: RootOutput,
  ): void {
    const primitives = ourOutput.primitives.map((primitive) => ({
      ...primitive,
      source: this.config.syncProtocol.name,
    }));
    const blockInfo = ourOutput.blockHashes.map((hash) => ({
      protocol_name: this.config.syncProtocol.name,
      block_number: Number(ourOutput.raw.height),
      blockHash: hash,
    }));
    rootOutput.primitives.push(...primitives);
    rootOutput.blockInfo.push(...blockInfo);
  }

  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    const block = Number(data.raw.height);
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
      { networkType: ConfigNetworkType.BITCOIN }
    >,
    fetcher: BitcoinFetcher,
  ): Operation<BitcoinSyncState> {
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new BitcoinSyncState(
      page,
      config,
      fetcher,
      dbConn,
    );
  }
}

