import {
  ConfigSyncProtocolType,
  type PrimitiveEntry,
} from "@effectstream/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type {
  ConfigType,
  Input,
  Output,
  Page,
  PrimitiveType,
} from "./types.ts";
import { SolanaClient } from "./SolanaClient.ts";
import { extractProgramLogs } from "./program-logs.ts";
import { call, type Operation } from "effection";
import { bound } from "@effectstream/utils";

export class SolanaFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: SolanaClient;

  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    this.client = new SolanaClient(config.network.rpcUrl);
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];

    console.log(
      `[Solana] Fetching slots from ${data.from} to ${data.to}.${
        data.isPresync ? " [presync]" : ""
      }`,
    );

    for (let slot = Number(data.from); slot <= Number(data.to); slot++) {
      const block = yield* call(() =>
        this.client.getBlock(slot)
      );

      // Skipped slots (no block produced) are skipped gracefully
      if (!block) {
        continue;
      }

      const primitives = yield* this.readPrimitives(
        slot,
        block,
        this.config.primitives,
      );

      outputs.push({
        output: {
          slot,
          blockhash: block.blockhash,
          blockTime: block.blockTime,
          blockHeight: block.blockHeight,
          parentSlot: block.parentSlot,
          // `meta` is null for transactions the RPC couldn't decode; keep the
          // entry (it still occupies a tx index) but don't dereference it.
          transactions: (block.transactions ?? []).map((tx) => ({
            err: tx.meta?.err ?? null,
            logMessages: tx.meta?.logMessages ?? null,
            preBalances: tx.meta?.preBalances ?? [],
            postBalances: tx.meta?.postBalances ?? [],
          })),
          primitives,
        },
        cleanup: () => {},
      });
    }

    if (outputs.length === 0) {
      if (!lastPage) {
        throw new Error(
          `[Solana] Could not fetch any blocks from ${data.from} to ${data.to} and no previous page was found.`,
        );
      }
      return {
        output: [],
        lastPage,
      };
    }

    const lastOutput = outputs[outputs.length - 1].output;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: lastOutput.slot,
        own: lastOutput.slot as Page,
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }

  @bound
  *readPrimitives(
    slot: number,
    block: {
      transactions: {
        transaction: {
          message: { accountKeys: string[] };
          signatures: string[];
        };
        meta: {
          err: unknown | null;
          logMessages: string[] | null;
          postBalances: number[];
        } | null;
      }[];
    },
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL }
    >[],
  ): Operation<PrimitiveType[]> {
    if (primitiveEntries.length === 0) return [];

    const allPrimitives: PrimitiveType[] = [];

    for (
      let txIndex = 0;
      txIndex < block.transactions.length;
      txIndex++
    ) {
      const tx = block.transactions[txIndex];
      // A reverted transaction has no on-chain effect: its logs describe work
      // that was rolled back and its postBalances are the pre-state. Emitting
      // primitives for it would drive state transitions off events that never
      // happened. `meta == null` means the RPC couldn't decode the tx — equally
      // unusable, so skip both.
      if (!tx.meta || tx.meta.err) continue;
      const accountKeys = tx.transaction.message.accountKeys;
      const logs = tx.meta.logMessages ?? [];
      const postBalances = tx.meta.postBalances ?? [];
      const txHash = tx.transaction.signatures[0] ?? "";

      for (const entry of primitiveEntries) {
        const prim = entry.primitive;

        // ── SOLANA:AccountBalance — watch an address's lamport balance ──
        if (prim.address) {
          const idx = accountKeys.indexOf(prim.address);
          if (idx === -1) continue;
          allPrimitives.push({
            syncProtocol: {
              name: entry.syncProtocol,
              blockNumber: slot,
              transactionHash: txHash,
              contractAddress: prim.address,
              logIndex: txIndex,
            },
            primitive: prim.name,
            output: {
              payloadType: "solana:balance",
              payload: {
                address: prim.address,
                lamports: postBalances[idx] ?? 0,
                slot,
              },
            },
          });
          continue;
        }

        // ── SOLANA:ProgramLog — logs the watched programId actually emitted ──
        if (prim.programId) {
          // Source of truth is the log stream's invoke/success framing, NOT
          // accountKeys: naming a program as an account doesn't invoke it, and
          // a program reached through a lookup table isn't in accountKeys at
          // all. See program-logs.ts.
          const programLogs = extractProgramLogs(logs, prim.programId);
          if (programLogs == null) continue;
          // Filter by eventType if specified — against this program's own lines
          // only, so another program can't trigger it by echoing the string.
          if (prim.eventType) {
            const hasMatchingLog = programLogs.some((log) =>
              log.includes(prim.eventType!)
            );
            if (!hasMatchingLog) continue;
          }
          allPrimitives.push({
            syncProtocol: {
              name: entry.syncProtocol,
              blockNumber: slot,
              transactionHash: txHash,
              contractAddress: prim.programId,
              logIndex: txIndex,
            },
            primitive: prim.name,
            output: {
              payloadType: "solana:transaction",
              payload: {
                programId: prim.programId,
                slot,
                logMessages: programLogs,
              },
            },
          });
        }
      }
    }

    return allPrimitives;
  }
}
