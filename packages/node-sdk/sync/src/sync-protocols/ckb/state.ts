import { applyDelay } from "../common/utils.ts";
import { bufferAtCap, genInputRange } from "../common/page-helpers.ts";
import { call, type Operation } from "effection";
import { getPage } from "@effectstream/db";
import type { PoolClient } from "pg";
import { bound, type BlockNumber } from "@effectstream/utils";
import { SyncState, type LastPage } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { CkbFetcher } from "./fetcher.ts";
import { ckbPageRelation } from "./fetcher.ts";
import type { ConfigNetworkType, SyncProtocolWithNetwork } from "@effectstream/config";
import type { Input, Output, Page } from "./types.ts";

type CkbConfig = Extract<SyncProtocolWithNetwork, { networkType: ConfigNetworkType.CKB }>;

export class CkbSyncState extends SyncState<Input, Output, Page, RootOutput, RootPage, CkbFetcher> {
  constructor(
    lastPage: LastPage<Page, RootPage> | undefined,
    readonly config: CkbConfig,
    fetcher: CkbFetcher,
    dbConn: PoolClient,
  ) {
    super(config.syncProtocol.name, lastPage, fetcher, ckbPageRelation, dbConn);
  }

  @bound
  override toRootOutput(_data: Output): RootOutput {
    throw new Error("CKB sync is a parallel protocol and cannot create root outputs.");
  }

  @bound
  override toRootPage(data: Output): RootPage {
    return applyDelay(
      Number(data.raw.timestamp),
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    return yield* genInputRange(
      this as CkbSyncState,
      { height: this.config.syncProtocol.startBlockHeight as Page["height"] },
      {
        name: this.config.syncProtocol.name,
        startPage: { height: this.config.syncProtocol.startBlockHeight as Page["height"] },
      },
      this.getNamespace(),
    );
  }

  @bound
  override toPage(_input: Input, data: Output[]): Page {
    const last = data.at(-1);
    if (!last) throw new Error("CKB fetch returned no block outputs.");
    return last.page;
  }

  @bound
  override mergeDatum(ourOutput: Output, rootOutput: RootOutput): void {
    rootOutput.primitives.push(...ourOutput.primitives.map((primitive) => ({
      ...primitive,
      source: this.config.syncProtocol.name,
    })));
    rootOutput.blockInfo.push(...ourOutput.blockHashes.map((hash) => ({
      protocol_name: this.config.syncProtocol.name,
      block_number: ourOutput.raw.height,
      blockHash: hash,
    })));
  }

  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    return {
      own: data.page,
      ownBlockNumber: data.page.height as BlockNumber,
      root: this.toRootPage(data),
    };
  }

  @bound
  override getNamespace(): string[] {
    return [this.config.network.name, this.config.syncProtocol.name];
  }

  static *restoreState(dbConn: PoolClient, config: CkbConfig, fetcher: CkbFetcher): Operation<CkbSyncState> {
    const [result] = yield* call(async () => getPage.run({
      protocol_name: config.syncProtocol.name,
    }, dbConn));
    const page = result?.page as unknown as LastPage<Page, RootPage> | undefined;
    return new CkbSyncState(page, config, fetcher, dbConn);
  }
}
