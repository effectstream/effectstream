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
  readonly client: MidnightClient;
  private readonly networkId?: string;
  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    const indexerHttp = config.syncProtocol.indexer;
    if (!indexerHttp) {
      throw new Error(
        `Midnight sync protocol "${config.syncProtocol.name}" requires an indexer URL.`,
      );
    }
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

    this.client = new MidnightClient(
      indexerHttp,
      this.networkId,
      requestTimeoutOf(config.syncProtocol),
    );
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

  // Mirror of fetchUnshieldedSpends over `unshieldedCreatedOutputs` — every
  // unshielded UTXO created in the block (regular AND system transactions).
  // One state-machine input per created output.
  @bound
  fetchUnshieldedCreates(
    height: number,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): PrimitiveType[] {
    const results: PrimitiveType[] = [];
    for (const tx of block.block.transactions) {
      for (const created of tx.unshieldedCreatedOutputs ?? []) {
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
            payload: {
              owner: created.owner,
              intentHash: created.intentHash,
              outputIndex: created.outputIndex,
              value: created.value,
              tokenType: created.tokenType,
              txHash: tx.hash,
            },
          },
        });
      }
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
      const f = primitive.contract;
      const ledgerFromTxStateHex = (f as {
        ledgerFromTxStateHex?: (rawHexState: string) => Record<string, any>;
      } | undefined)?.ledgerFromTxStateHex;
      let state: Record<string, any>;
      try {
        if (typeof ledgerFromTxStateHex === "function") {
          state = ledgerFromTxStateHex(rawState);
        } else {
          const hexBytes = rawState.match(/.{1,2}/g);
          if (!hexBytes) throw new Error("contract state is empty");
          const byteState = new Uint8Array(hexBytes.map(byte => parseInt(byte, 16)));
          const contractState = ContractState.deserialize(byteState);
          const stateValue = contractState.data.state;
          const generatedFields = f?.ledger(stateValue) ?? {};
          const schemaFields = primitive.parseAdditionalLedgerFields?.(stateValue) ?? {};
          state = { ...generatedFields, ...schemaFields };
        }
      } catch (error) {
        throw new Error(
          `Failed to decode Midnight contract ${contractAddress} at block ${height}, transaction ${t.hash}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
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
