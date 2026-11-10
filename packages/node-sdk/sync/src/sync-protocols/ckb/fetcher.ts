import { CkbRpcClient, ReadOnlyCkbObserver, validateCkbConnectorConfig } from "ckb-multichain-connector";
import { call, type Operation } from "effection";
import { bound, type CkbBlockHash, type CkbBlockNumber } from "@effectstream/utils";
import type { DataFetched, PaginatedFetcher } from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { RootConversion } from "../base/state.ts";
import { fetchNewestPage, type PageRange } from "../base/page.ts";
import { BaseDataFetcher } from "../base/fetcher.ts";
import { ConfigSyncProtocolType } from "@effectstream/config";
import type { CkbCellCreatedEventV1, CkbConnectorConfig, CkbCursor, CkbFetch } from "ckb-multichain-connector";
import type { ConfigType, Input, Output, Page, PrimitiveType } from "./types.ts";

export const ckbPageRelation = {
  compare: (a: Page, b: Page) => a.height - b.height,
  equals: (a: Page, b: Page) => a.height === b.height,
  min: (a: Page, b: Page) => a.height <= b.height ? a : b,
  max: (a: Page, b: Page) => a.height >= b.height ? a : b,
};

export class CkbFetcher extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements PaginatedFetcher<Page> {
  private readonly observerConfig: CkbConnectorConfig;
  private readonly rpc: CkbRpcClient;
  private readonly fetchImpl: CkbFetch;

  constructor(readonly config: ConfigType, fetchImpl: CkbFetch = fetch) {
    super(config.syncProtocol.name);
    if (config.primitives.length !== 1) {
      throw new Error("CKB sync requires exactly one primitive entry per protocol.");
    }
    if (config.syncProtocol.stepSize > config.syncProtocol.reorgWindow) {
      throw new Error("CKB stepSize must not exceed reorgWindow so every committed checkpoint is compared.");
    }
    this.observerConfig = validateCkbConnectorConfig({
      rpcUrl: config.network.rpcUrl,
      network: config.network.network,
      genesisBlockHash: config.network.genesisBlockHash,
      startBlockHeight: String(config.syncProtocol.startBlockHeight),
      confirmationDepth: config.syncProtocol.confirmationDepth,
      reorgWindow: config.syncProtocol.reorgWindow,
      requestTimeoutMs: config.syncProtocol.requestTimeoutMs,
      pollIntervalMs: config.syncProtocol.pollingInterval,
      targetScript: config.syncProtocol.targetScript,
    });
    this.fetchImpl = fetchImpl;
    this.rpc = new CkbRpcClient(
      this.observerConfig.rpcUrl,
      this.observerConfig.requestTimeoutMs,
      fetchImpl,
    );
  }

  @bound
  override *readData(
    input: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: Output[] = [];
    let cursor: CkbCursor | undefined = input.from.cursor;
    const observer = new ReadOnlyCkbObserver(this.observerConfig, { cursor, fetch: this.fetchImpl });
    const primitiveId = this.config.primitives[0]!.id;

    for (let height = input.from.height; height <= input.to.height; height++) {
      const previousCursor = cursor;
      const batch = yield* call(() => observer.observeAvailable(String(height)));
      if (batch.invalidatedEventIds.length > 0 || hasCheckpointReplacement(previousCursor, batch.cursor)) {
        throw new Error(
          `CKB canonical history changed at or before block ${height}; invalidated ${batch.invalidatedEventIds.length} event(s). Stop sync and perform an explicit recovery.`,
        );
      }
      if (batch.cursor.lastProcessed?.height !== String(height)) {
        throw new Error(`CKB observer did not complete requested block ${height}.`);
      }
      const block = yield* call(() => this.getBlock(height));
      if (block.hash !== batch.cursor.lastProcessed.hash) {
        throw new Error(`CKB block ${height} changed while it was being fetched.`);
      }
      const events = batch.events.filter((event) => event.source.blockHeight === String(height));
      const primitives = events.map((event) => this.toPrimitive(event, primitiveId));
      cursor = batch.cursor;
      const page: Page = { height: height as CkbBlockNumber, cursor };
      outputs.push({
        raw: { height: height as CkbBlockNumber, timestamp: block.timestamp, hash: block.hash },
        page,
        primitives,
        blockHashes: [block.hash],
      });
    }

    const last = outputs.at(-1);
    if (!last) throw new Error("CKB fetch interval was empty.");
    return {
      output: outputs.map((output) => ({ output, cleanup: () => {} })),
      lastPage: {
        own: last.page,
        ownBlockNumber: last.page.height,
        root: rootConversion.toRootPage(last),
      },
    };
  }

  private toPrimitive(event: CkbCellCreatedEventV1, primitiveId: string): PrimitiveType {
    const transactionIndex = Number(event.source.transactionIndex);
    if (!Number.isSafeInteger(transactionIndex)) {
      throw new Error("CKB transaction index exceeds the native safe integer range.");
    }
    return {
      syncProtocol: {
        name: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
        blockNumber: Number(event.source.blockHeight),
        transactionHash: event.source.transactionHash,
        transactionIndex,
        // A CKB script hash is not an address. Keep it in the typed event
        // payload instead of the shared field used for address routing/display.
      },
      primitive: primitiveId,
      output: { payloadType: "ckb-cell-created:v1", payload: event },
    } as PrimitiveType;
  }

  async getBlock(height: number): Promise<{ height: CkbBlockNumber; hash: CkbBlockHash; timestamp: bigint }> {
    const value = await this.rpc.call<unknown>("get_block_by_number", [`0x${height.toString(16)}`]);
    if (!isRecord(value) || !isRecord(value.header)) {
      throw new Error(`CKB RPC returned an invalid block at height ${height}.`);
    }
    const hash = value.header.hash;
    const rawHeight = value.header.number;
    const timestamp = value.header.timestamp;
    if (
      typeof hash !== "string" || !/^0x[0-9a-f]{64}$/.test(hash) ||
      typeof rawHeight !== "string" || !/^0x[0-9a-f]+$/.test(rawHeight) ||
      BigInt(rawHeight) !== BigInt(height) ||
      typeof timestamp !== "string" || !/^0x[0-9a-f]+$/.test(timestamp)
    ) {
      throw new Error(`CKB RPC returned malformed block metadata at height ${height}.`);
    }
    const timestampMs = BigInt(timestamp);
    if (timestampMs > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`CKB timestamp at height ${height} exceeds the native safe integer range.`);
    }
    return { height: height as CkbBlockNumber, hash: hash as CkbBlockHash, timestamp: timestampMs };
  }

  @bound
  *getLatestPage(knownLastPage: Page | undefined): Operation<Page> {
    const fetch = function* (self: CkbFetcher): Operation<Page> {
      const header = yield* call(() => self.rpc.call<unknown>("get_tip_header", []));
      if (!isRecord(header) || typeof header.number !== "string" || !/^0x[0-9a-f]+$/.test(header.number)) {
        throw new Error("CKB RPC returned an invalid tip header.");
      }
      const eligible = BigInt(header.number) - BigInt(self.observerConfig.confirmationDepth);
      const stop = self.config.syncProtocol.stopBlockHeight;
      const bounded = stop == null || eligible < BigInt(stop) ? eligible : BigInt(stop);
      const height = bounded < 0n ? 0n : bounded;
      if (height > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("CKB eligible block height is outside the native safe integer range.");
      }
      const checkpoint = knownLastPage?.cursor?.lastProcessed;
      if (checkpoint) {
        const canonical = yield* call(() => self.rpc.call<unknown>("get_header_by_number", [
          `0x${BigInt(checkpoint.height).toString(16)}`,
        ]));
        if (!isRecord(canonical) || canonical.hash !== checkpoint.hash) {
          throw new Error(
            `CKB canonical checkpoint changed at height ${checkpoint.height}; stop sync and perform an explicit recovery.`,
          );
        }
      }
      return { height: Number(height) as CkbBlockNumber, cursor: knownLastPage?.cursor };
    };
    return yield* fetchNewestPage(
      ckbPageRelation,
      () => fetch(this),
      knownLastPage,
      this.config.syncProtocol.pollingInterval,
    );
  }

  @bound
  previousInterval(nextStart: Page): PageRange<Page> {
    return this.intervalFromStart({ height: Math.max(0, nextStart.height - this.config.syncProtocol.stepSize) as CkbBlockNumber });
  }

  @bound
  nextInterval(previousEnd: Page): PageRange<Page> {
    return this.intervalFromStart({ height: (previousEnd.height + 1) as CkbBlockNumber, cursor: previousEnd.cursor });
  }

  @bound
  intervalFromStart(start: Page): PageRange<Page> {
    return {
      from: start,
      to: { height: (start.height + this.config.syncProtocol.stepSize - 1) as CkbBlockNumber, cursor: start.cursor },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCheckpointReplacement(previous: CkbCursor | undefined, current: CkbCursor): boolean {
  if (!previous) return false;
  const currentByHeight = new Map(current.checkpoints.map((checkpoint) => [checkpoint.height, checkpoint.hash]));
  for (const checkpoint of previous.checkpoints) {
    const replacement = currentByHeight.get(checkpoint.height);
    if (replacement !== undefined && replacement !== checkpoint.hash) return true;
  }
  return false;
}
