import { applyDelay, blockNumberRelation } from "../common/utils.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { getPage } from "@effectstream/db";
import type { PoolClient } from "pg";
import { bound, type BlockNumber } from "@effectstream/utils";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { TestFetcher } from "./fetcher.ts";
import { bufferAtCap, genInputRange } from "../common/page-helpers.ts";
import type { Input, Output, Page } from "./types.ts";
import { toMsTimestamp } from "./types.ts";
import type {
  ConfigNetworkType,
  SyncProtocolWithNetwork,
} from "@effectstream/config";

type TestConfig = Extract<
  SyncProtocolWithNetwork,
  { networkType: ConfigNetworkType.TEST }
>;

/**
 * Synthetic test chain state. Implements BOTH roles:
 * - as a TEST_MAIN clock, `toRootOutput` produces root blocks;
 * - as a TEST_PARALLEL source, `mergeDatum` folds its primitives into the root.
 * The merge only calls the method appropriate to the chain's position (main at
 * index 0), so implementing both is safe.
 */
export class TestSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  TestFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage>,
    readonly config: TestConfig,
    fetcher: TestFetcher,
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
      primitives: data.primitives.map((p) => ({
        ...p,
        source: this.config.syncProtocol.name,
      })),
    };
  }

  @bound
  override toRootPage(data: Output): RootPage {
    return applyDelay(
      toMsTimestamp(data.raw.timestamp),
      (this.config.syncProtocol as { delayMs?: number }).delayMs ?? 0,
    );
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    return yield* genInputRange(
      this as TestSyncState,
      this.config.syncProtocol.startBlockHeight as BlockNumber,
      {
        name: this.config.syncProtocol.name,
        startPage: this.config.syncProtocol.startBlockHeight as BlockNumber,
      },
      this.getNamespace(),
    );
  }

  @bound
  override toPage(
    _input: Input,
    _data: Output[],
  ): Page {
    return Number(_input.to);
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
      block_number: Number(ourOutput.raw.blockNumber),
      blockHash: h,
    }));
    rootOutput.primitives.push(...primitives);
    rootOutput.blockInfo.push(...blockInfo);
  }

  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    const block = Number(data.raw.blockNumber);
    return {
      own: block,
      ownBlockNumber: block as BlockNumber,
      root: this.toRootPage(data),
    };
  }

  @bound
  override getNamespace(): string[] {
    return [this.config.network.name, this.config.syncProtocol.name];
  }

  static *restoreState(
    dbConn: PoolClient,
    config: TestConfig,
    fetcher: TestFetcher,
  ): Operation<TestSyncState> {
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page: any = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new TestSyncState(
      page,
      config,
      fetcher,
      dbConn,
    );
  }
}
