import { BaseDataFetcher, type DataFetched } from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Operation } from "effection";
import { bound, uint8ArrayToHexString } from "@effectstream/utils";
import type { ChainPoint, CompletedBlock, ConfigType, Input, Output, Page, PrimitiveType } from "./types.ts";
import type { OutputAndCleanup, RootConversion } from "../base/state.ts";
import type { WatchMultiplexer } from "./WatchMultiplexer.ts";
import type { cardano } from "@utxorpc/spec";
import { matchesPredicate, predicateKey } from "./utils.ts";

export class UtxoRpcFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
{
  constructor(
    readonly config: ConfigType,
    readonly multiplexer: WatchMultiplexer,
  ) {
    super(config.syncProtocol.name);
  }

  @bound
  async startAsync(point?: ChainPoint) {
    await this.multiplexer.start(point);
  }

  @bound
  async resolveOrigin(): Promise<ChainPoint> {
    return this.multiplexer.resolveOrigin();
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    console.log(
      `[UTXORPC] Fetching blocks from ${data.from} to ${data.to}. ${
        data.isPresync ? "[presync]" : ""
      }`,
    );
    const outputs: OutputAndCleanup<Output>[] = [];
    const blocks = this.multiplexer.fetchBlocks(data.from, data.to);
    for (const entry of blocks) {
      const completed = entry.output;
      outputs.push({
        output: {
          blockHashes: [completed.hash],
          raw: completed.block,
          primitives: this.findPrimitivesFromWatchData(completed),
        },
        cleanup: entry.cleanup,
      });
    }
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: Number(data.to),
        own: {
          slot: Number(
            outputs[outputs.length - 1].output.raw.header!.slot,
          ),
          height: Number(
            outputs[outputs.length - 1].output.raw.header!.height,
          ),
          hash: outputs[outputs.length - 1].output.blockHashes[0],
        },
        root: rootConversion.toRootPage({
          blockHashes: [],
          primitives: [],
          raw: outputs[outputs.length - 1].output.raw,
        }),
      },
    };
  }

  @bound
  findPrimitivesFromWatchData(completed: CompletedBlock): PrimitiveType[] {
    const primitiveResponses: PrimitiveType[] = [];
    const block = completed.block;
    const txIndexCache = new Map<string, number>();

    for (const primitiveEntry of this.config.primitives) {
      const pKey = predicateKey(primitiveEntry.primitive.predicate);
      const matchedTxs = completed.matchedTxsByPredicate.get(pKey)
        ?? this.findFallbackTxs(completed, primitiveEntry.primitive.predicate);

      let logIndex = 0;
      for (const tx of matchedTxs) {
        if (!matchesPredicate(tx, primitiveEntry.primitive.predicate)) {
          continue;
        }

        const txHashHex = uint8ArrayToHexString(tx.hash);
        let transactionIndex = txIndexCache.get(txHashHex);
        if (transactionIndex === undefined) {
          transactionIndex = block.body?.tx.findIndex(t =>
            t.hash.length === tx.hash.length && t.hash.every((b, i) => b === tx.hash[i])
          ) ?? -1;
          txIndexCache.set(txHashHex, transactionIndex);
        }

        primitiveResponses.push({
          syncProtocol: {
            name: primitiveEntry.syncProtocol,
            blockNumber: Number(block.header!.height),
            transactionHash: txHashHex,
            transactionIndex,
            contractAddress: '',
            logIndex,
            absoluteSlot: Number(block.header!.slot),
          },
          primitive: primitiveEntry.primitive.name,
          output: {
            payloadType: 'utxorpc-response',
            payload: { tx }
          }
        });
        ++logIndex;
      }
    }
    return primitiveResponses;
  }

  /**
   * When a primitive's predicate key doesn't exactly match any watcher key
   * (e.g., has_certificate primitives merged into match-all watcher),
   * fall back to scanning all matched txs across all watchers.
   */
  private findFallbackTxs(
    completed: CompletedBlock,
    _predicate: unknown,
  ): cardano.Tx[] {
    const seen = new Set<string>();
    const txs: cardano.Tx[] = [];
    for (const [, watcherTxs] of completed.matchedTxsByPredicate) {
      for (const tx of watcherTxs) {
        const hash = uint8ArrayToHexString(tx.hash);
        if (!seen.has(hash)) {
          seen.add(hash);
          txs.push(tx);
        }
      }
    }
    return txs;
  }

  lastHeight(): bigint | undefined {
    return this.multiplexer.lastHeight();
  }
}
