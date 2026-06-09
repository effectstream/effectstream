import { call, type Operation } from "effection";
import { bound } from "@effectstream/utils";
import type { PoolClient } from "pg";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Input, Output, Page } from "./types.ts";
import { blockNumberRelation } from "../common/utils.ts";
import type { SolanaFetcher } from "./fetcher.ts";
import type {
  ConfigNetworkType,
  SyncProtocolWithNetwork,
} from "@effectstream/config";
import { getPage } from "@effectstream/db";
import { SolanaClient } from "./SolanaClient.ts";
import { applyDelay } from "../common/utils.ts";
import { genInputRange } from "../common/page-helpers.ts";

export class SolanaSyncState extends SyncState<
  Input,
  Output,
  Page,
  RootOutput,
  RootPage,
  SolanaFetcher
> {
  constructor(
    lastPage: LastPage<Page, RootPage> | undefined,
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { networkType: ConfigNetworkType.SOLANA }
    >,
    fetcher: SolanaFetcher,
    public readonly client: SolanaClient,
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
  override toPage(_input: Input, data: Output[]): Page {
    const lastBlock = data[data.length - 1];
    return lastBlock.slot as Page;
  }

  @bound
  override toRootPage(data: Output): RootPage {
    // Solana blockTime is in seconds; use slot as tiebreaker for
    // deterministic ordering when timestamps are equal
    const timestampMs = (data.blockTime ?? 0) * 1000;
    // Add a tiny offset based on slot position to break ties deterministically
    const tieBreaker = (data.slot % 1000) * 0.001;
    return applyDelay(
      (timestampMs + tieBreaker) as import("@effectstream/utils").TimestampMs,
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override toRootOutput(_data: Output): RootOutput {
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    return yield* genInputRange(
      this as SolanaSyncState,
      this.config.syncProtocol.startBlockHeight as Page,
      {
        name: this.config.syncProtocol.name,
        startPage: this.config.syncProtocol.startBlockHeight as Page,
      },
      this.getNamespace(),
    );
  }

  @bound
  override mergeDatum(ourOutput: Output, rootOutput: RootOutput): void {
    const primitives = ourOutput.primitives.map((p) => ({
      ...p,
      source: this.config.syncProtocol.name,
    }));
    const blockInfo = [{
      protocol_name: this.config.syncProtocol.name,
      block_number: ourOutput.slot,
      blockHash: ourOutput.blockhash,
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
      { networkType: ConfigNetworkType.SOLANA }
    >,
    fetcher: SolanaFetcher,
  ): Operation<SolanaSyncState> {
    const [result] = yield* call(async () =>
      await getPage.run({
        protocol_name: config.syncProtocol.name,
      }, dbConn)
    );
    const page = result
      ? result.page as unknown as LastPage<Page, RootPage>
      : undefined;
    return new SolanaSyncState(
      page,
      config,
      fetcher,
      new SolanaClient(config.network.rpcUrl),
      dbConn,
    );
  }
}
