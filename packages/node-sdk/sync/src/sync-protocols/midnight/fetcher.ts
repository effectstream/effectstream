import { BaseDataFetcher } from "../base/fetcher.ts";
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
import { decodeZswapInputEvent } from "./zswap-decoder.ts";

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
    const indexerWs =
      (config.syncProtocol as any).indexerWS ??
      (config.syncProtocol as any).indexerWs;
    if (!indexerHttp || !indexerWs) {
      throw new Error(
        `Midnight sync protocol "${
          config.syncProtocol.name
        }" requires both indexer and indexerWS URLs. Received indexer=${
          indexerHttp ?? "undefined"
        }, indexerWS=${indexerWs ?? "undefined"}.`,
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
      indexerWs,
      this.networkId,
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
          p.primitive.type !== "Midnight:Nullifier" &&
          p.primitive.type !== "Midnight:UnshieldedSpend" &&
          p.primitive.type !== "Midnight:UnshieldedCreate" &&
          p.primitive.type !== "Midnight:ZswapRoot",
      ),
      zswapLedgerEvents: this.config.primitives.some(
        (p) => p.primitive.type === "Midnight:Nullifier",
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
      if (primitiveEntry.primitive.type === "Midnight:Nullifier") {
        syncResults.push(...this.fetchNullifiers(height, primitiveEntry, block));
      } else if (primitiveEntry.primitive.type === "Midnight:UnshieldedSpend") {
        syncResults.push(...this.fetchUnshieldedSpends(height, primitiveEntry, block));
      } else if (primitiveEntry.primitive.type === "Midnight:UnshieldedCreate") {
        syncResults.push(...this.fetchUnshieldedCreates(height, primitiveEntry, block));
      } else if (primitiveEntry.primitive.type === "Midnight:ZswapRoot") {
        syncResults.push(...this.fetchZswapRoots(height, primitiveEntry, block));
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
  fetchNullifiers(
    height: number,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): PrimitiveType[] {
    const results: PrimitiveType[] = [];
    for (const tx of block.block.transactions) {
      for (const event of tx.zswapLedgerEvents ?? []) {
        const decoded = decodeZswapInputEvent(event.raw);
        if (!decoded) continue;
        results.push({
          syncProtocol: {
            name: primitiveEntry.syncProtocol,
            blockNumber: height,
            transactionHash: tx.hash,
            contractAddress: "",
          },
          primitive: primitiveEntry.primitive.name,
          output: {
            payloadType: "midnight-nullifier",
            payload: {
              nullifier: decoded.nullifier,
              txHash: decoded.txHash,
              eventId: event.id,
              logicalSegment: decoded.logicalSegment,
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

  @bound
  *fetchContractState(
    height: number,
    client: MidnightClient,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): Operation<PrimitiveType[]> {
    const contractAddress = primitiveEntry.primitive.contractAddress!;
    const blockFinalState = yield* call(() =>
      client.fetchContractState(contractAddress, height)
    );
    // The state returns null if the contract was not called in the block height
    if (!blockFinalState) {
      return [];
    }

    const transactions = block.block.transactions.filter((t) => {
      return (t.contractActions ?? []).some((c) => {
        const longest = Math.max(contractAddress.length, c.address.length);
        // Addresses length can be padded by 0's
        return c.address.padStart(longest, '0') === contractAddress.padStart(longest, '0');
      });
    });


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
