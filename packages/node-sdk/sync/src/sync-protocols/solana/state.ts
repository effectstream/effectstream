import { call, type Operation } from "effection";
import { bound } from "@effectstream/utils";
import type { PoolClient } from "pg";
import { type LastPage, SyncState } from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Input, Output, Page } from "./types.ts";
import { toMsTimestamp } from "./types.ts";
import { blockNumberRelation } from "../common/utils.ts";
import type { SolanaFetcher } from "./fetcher.ts";
import type {
  ConfigNetworkType,
  SyncProtocolWithNetwork,
} from "@effectstream/config";
import { getPage } from "@effectstream/db";
import { SolanaClient } from "./SolanaClient.ts";
import { applyDelay } from "../common/utils.ts";
import { bufferAtCap } from "../common/page-helpers.ts";

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
    // Solana blockTime is monotonically non-decreasing (enforced by the
    // cluster) — exactly what the merge gate needs: it pulls buffered parallel
    // outputs in slot order while their root timestamp is <= the main chain's,
    // so it disambiguates duplicate blockTimes by buffer/slot order, NOT by
    // this value. We therefore must NOT add a slot-derived offset: the previous
    // `(slot % 1000) * 0.001` was unnecessary AND broke monotonicity (it wrapped
    // every 1000 slots, so slot 1000's root could sort before slot 999's).
    return applyDelay(
      toMsTimestamp(data.blockTime),
      this.config.syncProtocol.delayMs,
    );
  }

  @bound
  override toRootOutput(_data: Output): RootOutput {
    throw new Error("Only main chains create root outputs");
  }

  @bound
  override *stateToInput(): Operation<Input | undefined> {
    // Pause fetching while the merge drains our buffer (CLAUDE.md finding #1).
    // Every other protocol gates on this first; skipping it lets the Deque grow
    // toward the whole backlog during catch-up.
    if (bufferAtCap(this, this.config.syncProtocol)) return undefined;
    // Query the chain tip directly (like NearSyncState) rather than via
    // genInputRange, which requires the fetcher to implement PaginatedFetcher
    // (getLatestPage/nextInterval/...) — SolanaFetcher does not.
    const latestSlot = yield* call(() => this.client.getSlot());
    const finalizedSlot = latestSlot - this.config.syncProtocol.confirmationDepth;

    const lastSlot = this.lastPage?.own
      ?? ((this.config.syncProtocol.startBlockHeight as Page) - 1);

    if (lastSlot >= finalizedSlot) {
      return undefined;
    }

    const from = (lastSlot + 1) as Page;
    const to = Math.min(
      Number(lastSlot) + this.config.syncProtocol.stepSize,
      finalizedSlot,
    ) as Page;

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
      block_number: ourOutput.slot,
      blockHash: ourOutput.blockhash,
    }];
    rootOutput.blockInfo.push(...blockInfo);
    rootOutput.primitives.push(...primitives);
  }

  /**
   * Resume marker for a single slot. `Page` is a flat slot number, so `own` and
   * `ownBlockNumber` are the same value (cf. EvmSyncState). Declared `abstract`
   * on SyncState and called unconditionally by the merge for every protocol that
   * contributes data to a block — see CLAUDE.md design idea #5.
   */
  @bound
  override outputToLastPage(data: Output): LastPage<Page, RootPage> {
    return {
      own: data.slot as Page,
      ownBlockNumber: data.slot as Page,
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
