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
    // Mirror the NEAR pattern: derive the fetch range from the live chain tip
    // (SolanaClient.getSlot) rather than genInputRange, which relies on
    // paginated-fetcher helpers the SolanaFetcher does not implement.
    const tipSlot = yield* call(() => this.client.getSlot());
    // Stay `confirmationDepth` slots behind the tip for finality.
    const confirmationDepth =
      (this.config.syncProtocol as { confirmationDepth?: number })
        .confirmationDepth ?? 32;
    const latestSafeSlot = tipSlot - confirmationDepth;

    const startSlot = this.lastPage?.own != null
      ? Number(this.lastPage.own)
      : this.config.syncProtocol.startBlockHeight - 1;

    if (startSlot >= latestSafeSlot) {
      return undefined;
    }

    const from = startSlot + 1;
    const to = Math.min(
      from + this.config.syncProtocol.stepSize - 1,
      latestSafeSlot,
    );

    return { from, to, isPresync: false } as Input;
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
