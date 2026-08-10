import { BaseDataFetcher } from "../base/fetcher.ts";
import { requestTimeoutOf } from "../common/http.ts";
import type {
  Block,
  ConfigType,
  Input,
  Output,
  Page,
  PrimitiveEntryType,
  PrimitiveType,
} from "./types.ts";
import { all, call, type Operation, useAbortSignal } from "effection";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import { bound } from "@effectstream/utils";
import { MidnightClient, type BlockFetchOptions, type MidnightGqlBlockState } from "./MidnightClient.ts";
import type { MidnightBlockClient } from "./block-client.ts";
import { UmbraClient, type UmbraClientOptions } from "./UmbraClient.ts";
import {
  assertExactlyOneMidnightSource,
  assertUmbraSourceNetworkAllowed,
} from "@effectstream/config";
import { ContractState, StateValue } from "@midnight-ntwrk/onchain-runtime";
import { decodeZswapEvent } from "./zswap-decoder.ts";
import { decodeTokenMints } from "./mint-decoder.ts";

export class MidnightFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  /** The block source. Both clients return the same block shape, which is what leaves every
   *  primitive mapping below — and every primitive class downstream — identical across the
   *  migration. See `block-client.ts` for why this is an interface rather than a swapped concrete
   *  type. */
  readonly client: MidnightBlockClient;
  private readonly networkId?: string;
  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    const indexerHttp = config.syncProtocol.indexer;
    const umbra = (config.syncProtocol as { umbra?: Omit<UmbraClientOptions, "networkId"> }).umbra;
    assertExactlyOneMidnightSource(config.syncProtocol.name, { indexer: indexerHttp, umbra });
    this.networkId = config.network?.networkId ??
      (config.network as any)?.id;

    if (this.networkId != null) {
      for (const entry of config.primitives) {
        const primitiveNetworkId = (entry.primitive as any).networkId;
        if (primitiveNetworkId != null && primitiveNetworkId !== this.networkId) {
          throw new Error(
            `Midnight primitive "${entry.primitive.name}" has networkId "${primitiveNetworkId}" ` +
            `but the network "${config.network.name}" uses networkId "${this.networkId}". ` +
            `These must match.`,
          );
        }
      }
    }

    if (umbra) {
      // Both checks are at CONSTRUCTION so a bad config dies at startup naming the problem, rather
      // than running against a feed that is empty or wrong for a reason nobody can see.
      assertUmbraSourceNetworkAllowed(config.syncProtocol.name, this.networkId);
      UmbraClient.assertPrimitivesSupported(
        config.primitives.map((p) => p.primitive.type as string),
      );
      this.client = new UmbraClient({ ...umbra, networkId: this.networkId! });
    } else {
      this.client = new MidnightClient(
        indexerHttp!,
        this.networkId,
        requestTimeoutOf(config.syncProtocol),
      );
    }
  }

  /** Releases the block source's resources (the UmbraDB pool); a no-op for the indexer client. */
  async close(): Promise<void> {
    await this.client.close?.();
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];
    console.log(
      `[Midnight${this.networkId ? `:${this.networkId}` : ""}] Fetching blocks from ${data.from} to ${data.to}. ${
        data.isPresync ? "[presync]" : ""
      }`,
    );
    const blockFetchOptions: BlockFetchOptions = {
      contractActions: this.config.primitives.some(
        (p) =>
          p.primitive.type !== "Midnight:NullifierAndCommitment" &&
          p.primitive.type !== "Midnight:UnshieldedSpend" &&
          p.primitive.type !== "Midnight:UnshieldedCreate" &&
          p.primitive.type !== "Midnight:ZswapRoot" &&
          p.primitive.type !== "Midnight:TokenMint",
      ),
      zswapLedgerEvents: this.config.primitives.some(
        (p) => p.primitive.type === "Midnight:NullifierAndCommitment",
      ),
      unshieldedSpentOutputs: this.config.primitives.some(
        (p) => p.primitive.type === "Midnight:UnshieldedSpend",
      ),
      unshieldedCreatedOutputs: this.config.primitives.some(
        (p) => p.primitive.type === "Midnight:UnshieldedCreate",
      ),
      zswapRoots: this.config.primitives.some(
        (p) => p.primitive.type === "Midnight:ZswapRoot",
      ),
      tokenMints: this.config.primitives.some(
        (p) => p.primitive.type === "Midnight:TokenMint",
      ),
    };
    const self = this;
    const heights = Array.from(
      { length: data.to - data.from + 1 },
      (_, i) => i + data.from,
    );
    const fetchAllBlocks = this.config.primitives.some(
      (p) => p.primitive.getAllBlockHeaders,
    );

    const fetched = yield* all(
      heights.map(function* (height) {
        const signal = yield* useAbortSignal();
        let result: MidnightGqlBlockState;
        let primitives;
        try {
          result = yield* call(() =>
            self.client.fetchBlock(height, blockFetchOptions, signal)
          );
          primitives = yield* self.readPrimitives(
            height,
            result,
            self.config.primitives,
          );
        } catch (e) {
          // Surface per-height failures: the outer fetch loop swallows errors
          // and retries silently, which previously hid a permanent failure
          // (e.g. a wasm-instance mismatch in a contract ledger() call) as an
          // ever-stuck page with no log output.
          console.error(
            `[Midnight] readData failed at height ${height}:`,
            (e as Error)?.stack ?? e,
          );
          throw e;
        }
        return {
          output: {
            raw: result.block as unknown as Block,
            primitives,
          },
          cleanup: () => {},
        };
      }),
    );

    const lastFetched = fetched[fetched.length - 1];
    if (fetchAllBlocks) {
      outputs.push(...fetched);
    } else {
      for (const item of fetched) {
        if (item.output.primitives.length > 0) {
          outputs.push(item);
        }
      }
      if (outputs.length === 0 || outputs[outputs.length - 1] !== lastFetched) {
        outputs.push(lastFetched);
      }
    }

    const lastOutput = lastFetched.output;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: lastOutput.raw.height,
        own: {
          height: lastOutput.raw.height,
          hash: lastOutput.raw.hash,
        },
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }

  @bound
  *readPrimitives(
    height: number,
    block: MidnightGqlBlockState,
    primitiveEntries: PrimitiveEntryType[],
  ): Operation<PrimitiveType[]> {
    const client = this.client;
    const asyncOps: Operation<PrimitiveType[]>[] = [];
    const syncResults: PrimitiveType[] = [];

    for (const primitiveEntry of primitiveEntries) {
      if (primitiveEntry.primitive.type === "Midnight:NullifierAndCommitment") {
        syncResults.push(...this.fetchZswapEvents(height, primitiveEntry, block));
      } else if (primitiveEntry.primitive.type === "Midnight:UnshieldedSpend") {
        syncResults.push(...this.fetchUnshieldedSpends(height, primitiveEntry, block));
      } else if (primitiveEntry.primitive.type === "Midnight:UnshieldedCreate") {
        syncResults.push(...this.fetchUnshieldedCreates(height, primitiveEntry, block));
      } else if (primitiveEntry.primitive.type === "Midnight:ZswapRoot") {
        syncResults.push(...this.fetchZswapRoots(height, primitiveEntry, block));
      } else if (primitiveEntry.primitive.type === "Midnight:TokenMint") {
        syncResults.push(...this.fetchTokenMints(height, primitiveEntry, block));
      } else {
        asyncOps.push(
          this.fetchContractState(height, client, primitiveEntry, block),
        );
      }
    }

    const asyncResults = (yield* all(asyncOps)).flat();
    return [...syncResults, ...asyncResults].filter(Boolean) as PrimitiveType[];
  }

  @bound
  fetchZswapEvents(
    height: number,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): PrimitiveType[] {
    const capture = primitiveEntry.primitive.capture ?? "both";
    const results: PrimitiveType[] = [];
    for (const tx of block.block.transactions) {
      for (const event of tx.zswapLedgerEvents ?? []) {
        const decoded = decodeZswapEvent(event.raw);
        if (!decoded) continue;
        if (decoded.kind === "nullifier" && capture === "commitments") continue;
        if (decoded.kind === "commitment" && capture === "nullifiers") continue;
        results.push({
          syncProtocol: {
            name: primitiveEntry.syncProtocol,
            blockNumber: height,
            transactionHash: tx.hash,
            contractAddress: "",
          },
          primitive: primitiveEntry.primitive.name,
          output: {
            payloadType: `midnight-${decoded.kind}`,
            payload: {
              ...decoded,
              eventId: event.id,
            },
          },
        });
      }
    }
    return results;
  }

  @bound
  fetchUnshieldedSpends(
    height: number,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): PrimitiveType[] {
    const results: PrimitiveType[] = [];
    for (const tx of block.block.transactions) {
      for (const spend of tx.unshieldedSpentOutputs ?? []) {
        results.push({
          syncProtocol: {
            name: primitiveEntry.syncProtocol,
            blockNumber: height,
            transactionHash: tx.hash,
            contractAddress: "",
          },
          primitive: primitiveEntry.primitive.name,
          output: {
            payloadType: "midnight-unshielded-spend",
            payload: {
              owner: spend.owner,
              intentHash: spend.intentHash,
              outputIndex: spend.outputIndex,
              value: spend.value,
              tokenType: spend.tokenType,
              txHash: tx.hash,
            },
          },
        });
      }
    }
    return results;
  }

  // NOTIFICATION, not a data copy (owner decision, 2026-08-09): one state-machine input per
  // transaction that created — or may have created — unshielded UTXOs. The created rows are NOT
  // copied into the payload; they stay in the source of record and a consumer reads them on demand
  // (`UmbraRead.getUnshieldedCreates(txHash)` for the UmbraDB source).
  //
  // "May have": a source that cannot fully derive a transaction's creates marks it
  // (`umbraDecodeRefused`, e.g. a ClaimRewards transaction) instead of halting sync. The trigger
  // fires either way, so nothing is silently dropped and the CONSUMER decides — which also keeps
  // the trigger set identical to the indexer's at reward heights.
  @bound
  fetchUnshieldedCreates(
    height: number,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): PrimitiveType[] {
    const results: PrimitiveType[] = [];
    for (const tx of block.block.transactions) {
      const hasCreates = (tx.unshieldedCreatedOutputs ?? []).length > 0;
      const refused = (tx as { umbraDecodeRefused?: string }).umbraDecodeRefused !== undefined;
      if (!hasCreates && !refused) continue;
      results.push({
        syncProtocol: {
          name: primitiveEntry.syncProtocol,
          blockNumber: height,
          transactionHash: tx.hash,
          contractAddress: "",
        },
        primitive: primitiveEntry.primitive.name,
        output: {
          payloadType: "midnight-unshielded-create",
          payload: { txHash: tx.hash },
        },
      });
    }
    return results;
  }

  // Emit the latest zswap coin-commitment Merkle tree root for the block: the
  // `zswapMerkleTreeRoot` of the last RegularTransaction that carries one.
  // Blocks with no regular transactions emit nothing (the root is unchanged).
  @bound
  fetchZswapRoots(
    height: number,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): PrimitiveType[] {
    let root: string | undefined;
    let txHash = "";
    for (const tx of block.block.transactions) {
      if (tx.zswapMerkleTreeRoot) {
        root = tx.zswapMerkleTreeRoot;
        txHash = tx.hash;
      }
    }
    if (!root) return [];
    return [
      {
        syncProtocol: {
          name: primitiveEntry.syncProtocol,
          blockNumber: height,
          transactionHash: txHash,
          contractAddress: "",
        },
        primitive: primitiveEntry.primitive.name,
        output: {
          payloadType: "midnight-zswap-root",
          payload: { root, txHash },
        },
      },
    ];
  }

  // Decode custom token mints out of each regular transaction's raw bytes
  // (ledger-v8 deserialize → contract call transcript effects). One input per
  // (tx, call, domainSep, kind) that actually applied on chain — see
  // mint-decoder.ts for the segment semantics. System transactions carry no
  // transactionResult and are skipped.
  @bound
  fetchTokenMints(
    height: number,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): PrimitiveType[] {
    const results: PrimitiveType[] = [];
    for (const tx of block.block.transactions) {
      if (!tx.raw || !tx.transactionResult) continue;
      for (const mint of decodeTokenMints(tx.raw, tx.transactionResult)) {
        results.push({
          syncProtocol: {
            name: primitiveEntry.syncProtocol,
            blockNumber: height,
            transactionHash: tx.hash,
            contractAddress: mint.contractAddress,
          },
          primitive: primitiveEntry.primitive.name,
          output: {
            payloadType: "midnight-token-mint",
            payload: {
              ...mint,
              txHash: tx.hash,
            },
          },
        });
      }
    }
    return results;
  }

  @bound
  *fetchContractState(
    height: number,
    _client: MidnightClient,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): Operation<PrimitiveType[]> {
    const contractAddress = primitiveEntry.primitive.contractAddress!;

    // Determine whether the contract was called in this block by inspecting
    // the contractActions already present in the fetched block data — no extra
    // network round-trip needed. The per-transaction state is also read from
    // contractActions below, so queryContractState would be redundant and its
    // accumulating internal WS subscriptions caused saturation during catch-up.
    const transactions = block.block.transactions.filter((t) => {
      return (t.contractActions ?? []).some((c) => {
        const longest = Math.max(contractAddress.length, c.address.length);
        // Addresses length can be padded by 0's
        return c.address.padStart(longest, '0') === contractAddress.padStart(longest, '0');
      });
    });

    if (transactions.length === 0) {
      return [];
    }

    return transactions.map(t => {
      // TODO: What does it mean if t.contractActions has more than one element?
      const rawState: string = t.contractActions.find((c) => {
        const longest = Math.max(contractAddress.length, c.address.length);
        // Addresses length can be padded by 0's
        return c.address.padStart(longest, '0') === contractAddress.padStart(longest, '0');
      })!.state!;
      const primitive = primitiveEntry.primitive;
      const f = primitive.contract ?? { ledger: (_: StateValue): Record<string, any> => ({}) };
      const ledgerFromTxStateHex = (f as {
        ledgerFromTxStateHex?: (rawHexState: string) => Record<string, any>;
      }).ledgerFromTxStateHex;
      let state: Record<string, any>;
      if (typeof ledgerFromTxStateHex === "function") {
        state = ledgerFromTxStateHex(rawState);
      } else {
        const byteState = new Uint8Array(rawState.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const contractState = ContractState.deserialize(byteState);
        const stateValue = contractState.data.state;
        const additionalFields = primitive.parseAdditionalLedgerFields?.(stateValue) ?? {};
        state = { ...f.ledger(stateValue), ...additionalFields };
      }
      return {
        syncProtocol: {
          name: primitiveEntry.syncProtocol,
          blockNumber: height,
          transactionHash: t.hash,
          contractAddress: contractAddress,
        },
        primitive: primitiveEntry.primitive.name,
        output: {
          payloadType: "midnight-contract-state",
          payload: state,
        },
      }
    });
  }
}
