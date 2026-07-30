import {
  ConfigSyncProtocolType,
  type PrimitiveEntry,
} from "@effectstream/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { DataFetched } from "../base/fetcher.ts";
import { requestTimeoutOf } from "../common/http.ts";
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
import {
  NearClient,
  parseNep297Log,
  type Nep297Event,
  type NearExecutionOutcomeWithId,
} from "./NearClient.ts";
import { call, type Operation } from "effection";
import { bound } from "@effectstream/utils";

export class NearFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: NearClient;

  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    this.client = new NearClient(
      config.network.rpcUrl,
      requestTimeoutOf(config.syncProtocol),
    );
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];

    console.log(
      `[NEAR] Fetching blocks from ${data.from} to ${data.to}.${
        data.isPresync ? " [presync]" : ""
      }`,
    );

    for (let height = data.from; height <= data.to; height++) {
      let block;
      try {
        block = yield* call(() =>
          this.client.getBlock({ block_id: height })
        );
      } catch (_e) {
        // Likely reached the chain tip; stop here
        break;
      }

      const blockHash = block.header.hash;
      // NEAR timestamps are in nanoseconds — convert to milliseconds
      const timestampMs = Math.floor(
        Number(block.header.timestamp_nanosec ?? block.header.timestamp) / 1_000_000,
      );

      const primitives = yield* this.readPrimitives(
        height,
        blockHash,
        block.chunks,
        this.config.primitives,
      );

      outputs.push({
        output: {
          timestamp: timestampMs,
          height,
          hash: blockHash,
          primitives,
        },
        cleanup: () => {},
      });
    }

    if (outputs.length === 0) {
      if (!lastPage) {
        throw new Error(
          `[NEAR] Could not fetch any blocks from ${data.from} to ${data.to} and no previous page was found.`,
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
        ownBlockNumber: lastOutput.height,
        own: {
          height: lastOutput.height,
          hash: lastOutput.hash,
        },
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }

  @bound
  *readPrimitives(
    height: number,
    blockHash: string,
    chunkHeaders: { chunk_hash: string; shard_id: number }[],
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.NEAR_RPC_PARALLEL }
    >[],
  ): Operation<PrimitiveType[]> {
    if (primitiveEntries.length === 0) return [];

    const allPrimitives: PrimitiveType[] = [];

    // Fetch each chunk and extract events from transactions
    for (const chunkHeader of chunkHeaders) {
      let chunk;
      try {
        chunk = yield* call(() =>
          this.client.getChunk(chunkHeader.chunk_hash)
        );
      } catch (_e) {
        // Chunk may be empty or unavailable
        continue;
      }

      for (const tx of chunk.transactions) {
        let txStatus;
        try {
          txStatus = yield* call(() =>
            this.client.getTxStatus(tx.hash, tx.signer_id)
          );
        } catch (_e) {
          continue;
        }

        // Collect all execution outcomes (transaction outcome + receipt outcomes)
        const allOutcomes: NearExecutionOutcomeWithId[] = [
          txStatus.transaction_outcome,
          ...txStatus.receipts_outcome,
        ];

        // Event-based primitives (Generic, Intent, NEP-141/171/245) match
        // NEP-297 logs emitted during execution.
        for (const outcomeWithId of allOutcomes) {
          const { outcome } = outcomeWithId;

          for (const log of outcome.logs) {
            const event = parseNep297Log(log);
            if (!event) continue;

            for (const entry of primitiveEntries) {
              const prim = entry.primitive;
              // AccountWatch primitives have no event metadata; skip them here.
              if (prim.eventStandard == null) continue;
              if (!this.matchesPrimitive(outcome.executor_id, event, prim)) {
                continue;
              }

              for (let i = 0; i < event.data.length; i++) {
                allPrimitives.push({
                  syncProtocol: {
                    name: entry.syncProtocol,
                    blockNumber: height,
                    transactionHash: tx.hash,
                    contractAddress: outcome.executor_id,
                    logIndex: i,
                  },
                  primitive: prim.name,
                  output: {
                    payloadType: `${event.standard}:${event.event}`,
                    payload: {
                      ...event.data[i] as Record<string, unknown>,
                      _standard: event.standard,
                      _version: event.version,
                      _event: event.event,
                    },
                  },
                });
              }
            }
          }
        }

        // AccountWatch primitives capture raw execution-outcome data for any
        // FunctionCall whose receiver matches the watched contractId, whether
        // or not a NEP-297 event was logged. This is the non-event path.
        const txStatusKind = txStatus.transaction_outcome.outcome.status;
        const txSucceeded =
          (txStatusKind as { SuccessValue?: string }).SuccessValue !== undefined ||
          (txStatusKind as { SuccessReceiptId?: string }).SuccessReceiptId !== undefined;
        const txStatusStr = txSucceeded ? "success" : "failure";

        for (const entry of primitiveEntries) {
          const prim = entry.primitive;
          // Identify outcome-based primitives by the absence of event metadata.
          if (prim.eventStandard != null) continue;
          if (prim.contractId !== tx.receiver_id) continue;

          for (let actionIndex = 0; actionIndex < tx.actions.length; actionIndex++) {
            const action = tx.actions[actionIndex];
            const fc = action.FunctionCall;
            if (!fc) continue;

            let argsDecoded = "";
            try {
              argsDecoded = Buffer.from(fc.args, "base64").toString("utf8");
            } catch {
              argsDecoded = fc.args;
            }

            allPrimitives.push({
              syncProtocol: {
                name: entry.syncProtocol,
                blockNumber: height,
                transactionHash: tx.hash,
                contractAddress: tx.receiver_id,
                logIndex: actionIndex,
              },
              primitive: prim.name,
              output: {
                payloadType: "account-watch:function-call",
                payload: {
                  signer_id: tx.signer_id,
                  receiver_id: tx.receiver_id,
                  method_name: fc.method_name,
                  args: argsDecoded,
                  deposit: fc.deposit,
                  status: txStatusStr,
                },
              },
            });
          }
        }
      }
    }

    return allPrimitives;
  }

  private matchesPrimitive(
    executorId: string,
    event: Nep297Event,
    prim: {
      contractId: string;
      eventStandard?: string;
      eventType?: string;
    },
  ): boolean {
    if (prim.contractId !== executorId) return false;
    if (prim.eventStandard && prim.eventStandard !== event.standard) return false;
    if (prim.eventType && prim.eventType !== event.event) return false;
    return true;
  }
}
