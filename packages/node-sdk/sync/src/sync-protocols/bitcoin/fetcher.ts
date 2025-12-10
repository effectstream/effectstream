import {
  BaseDataFetcher,
  type DataFetched,
  type PaginatedFetcher,
} from "../base/fetcher.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Operation } from "effection";
import { call } from "effection";
import { bound } from "@effectstream/utils";
import type {
  Input,
  Output,
  Page,
  PrimitiveEntryType,
  PrimitiveType,
  BitcoinBlock,
  BitcoinTransaction,
  BitcoinVout,
} from "./types.ts";
import type { PageRequest, PageRange } from "../base/page.ts";
import { genOnDemandPageRequests } from "../base/page.ts";
import type { PrimitiveFetcher } from "../base/primitive.ts";
import type { OutputAndCleanup, RootConversion } from "../base/state.ts";
import type { ConfigSyncProtocolType } from "@effectstream/config";
import type {
  BitcoinBlockHash,
  BitcoinTxId,
} from "@effectstream/utils";
import { blockNumberRelation } from "../common/utils.ts";
import type { ConfigType } from "./types.ts";

const SATOSHIS_PER_BTC = 100_000_000;
type PrimitiveEventDirection = "input" | "output";
type NormalizedAddress = string;
type BitcoinPrimitiveDirection = "inputs" | "outputs" | "both";

type Watcher = {
  entry: PrimitiveEntryType;
  direction: BitcoinPrimitiveDirection;
  normalizedAddress: NormalizedAddress;
  originalAddress: string;
};

type WatcherMap = Map<NormalizedAddress, Watcher[]>;

type ResolveAddressParams = {
  vout: BitcoinVout;
};

type BuildPrimitiveParams = {
  watcher: Watcher;
  block: BitcoinBlock;
  tx: BitcoinTransaction;
  txIndex: number;
  direction: PrimitiveEventDirection;
  index: number;
  utxo: { txid: BitcoinTxId; vout: number };
  valueSats: number;
};

type OutputEventParams = {
  block: BitcoinBlock;
  tx: BitcoinTransaction;
  txIndex: number;
  watchers: WatcherMap;
};

type InputEventParams = OutputEventParams & {
  txCache: Map<string, BitcoinTransaction>;
};

type TransactionLookupParams = {
  txid: string;
  cache: Map<string, BitcoinTransaction>;
};

export class BitcoinFetcher
  extends BaseDataFetcher<Input, Output, RootOutput, Page, RootPage>
  implements
    PrimitiveFetcher<
      Input,
      Page,
      BitcoinBlock,
      PrimitiveType,
      ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL
    >,
    PaginatedFetcher<Page> {
  constructor(
    readonly config: ConfigType,
    readonly rpcClient: BitcoinRpcClient,
  ) {
    super(config.syncProtocol.name);
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const pageFetcher = genOnDemandPageRequests(
      data.from,
      data.to,
      (page) => this.rpcClient.getBlockByHeight(Number(page)),
      blockNumberRelation,
    );

    const primitives = yield* this.readPrimitives(
      data,
      pageFetcher,
      this.config.primitives,
    );
    const groupedByPage = this.groupByPage(primitives);

    const outputs: OutputAndCleanup<Output>[] = [];
    for (let height = Number(data.from); height <= Number(data.to); height++) {
      const blockHeight = height as Page;
      const block = yield* call(() => pageFetcher(blockHeight));
      outputs.push({
        output: {
          raw: block,
          primitives: groupedByPage[String(height)] ?? [],
          blockHashes: [block.hash],
        },
        cleanup: () => {},
      });
    }
    const lastOutput = outputs[outputs.length - 1];
    if (!lastOutput) {
      throw new Error("BitcoinFetcher: no block data fetched for interval");
    }
    const lastBlock = lastOutput.output.raw;
    const lastPageRef = this.asPage(Number(data.to));
    return {
      output: outputs,
      lastPage: {
        own: lastPageRef,
        ownBlockNumber: lastPageRef,
        root: rootConversion.toRootPage({
          raw: lastBlock,
          primitives: [],
          blockHashes: [lastBlock.hash],
        }),
      },
    };
  }

  @bound
  groupByPage(
    primitives: PrimitiveType[],
  ): Record<string, PrimitiveType[]> {
    return primitives.reduce<Record<string, PrimitiveType[]>>(
      (acc, primitive) => {
        const key = String(primitive.syncProtocol.blockNumber);
        (acc[key] ??= []).push(primitive);
        return acc;
      },
      {},
    );
  }

  @bound
  *readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, BitcoinBlock>,
    primitiveEntries: PrimitiveEntryType[],
  ): Operation<PrimitiveType[]> {
    if (primitiveEntries.length === 0) {
      return [];
    }

    const watchers = this.buildWatcherMap(primitiveEntries);
    if (watchers.size === 0) {
      return [];
    }

    const primitives: PrimitiveType[] = [];
    const txCache = new Map<string, BitcoinTransaction>();

    for (let height = Number(data.from); height <= Number(data.to); height++) {
      const blockHeight = height as Page;
      const block = yield* call(() => pageRequest(blockHeight));
      const transactions = block.tx ?? [];
      for (let txIndex = 0; txIndex < transactions.length; txIndex++) {
        const tx = transactions[txIndex]!;
        const outputEvents = yield* call(() =>
          this.findOutputEvents({
            block,
            tx,
            txIndex,
            watchers,
          })
        );
        const inputEvents = yield* call(() =>
          this.findInputEvents({
            block,
            tx,
            txIndex,
            watchers,
            txCache,
          })
        );
        primitives.push(...outputEvents, ...inputEvents);
      }
    }
    return primitives;
  }

  private async findOutputEvents(
    params: OutputEventParams,
  ): Promise<PrimitiveType[]> {
    const events: PrimitiveType[] = [];
    for (const vout of params.tx.vout ?? []) {
      const address = await this.resolveAddressFromVout({ vout });
      const normalized = this.normalizeAddress(address);
      if (!normalized) continue;
      const watchers = params.watchers.get(normalized);
      if (!watchers?.length) continue;
      const valueSats = this.toSatoshis(vout.value);
      for (const watcher of watchers) {
        if (!this.directionEnabled(watcher.direction, "output")) {
          continue;
        }
        events.push(
          this.buildPrimitive({
            watcher,
            block: params.block,
            tx: params.tx,
            txIndex: params.txIndex,
            direction: "output",
            index: vout.n,
            utxo: {
              txid: params.tx.txid,
              vout: vout.n,
            },
            valueSats,
          }),
        );
      }
    }
    return events;
  }

  private async findInputEvents(
    params: InputEventParams,
  ): Promise<PrimitiveType[]> {
    const events: PrimitiveType[] = [];
    for (let vinIndex = 0; vinIndex < (params.tx.vin?.length ?? 0); vinIndex++) {
      const vin = params.tx.vin![vinIndex]!;
      if (!vin.txid || vin.vout == null) continue;
      const prevTx = await this.getTransactionFromCache({
        txid: vin.txid,
        cache: params.txCache,
      });
      const prevVout = prevTx?.vout?.find((entry) => entry.n === vin.vout);
      if (!prevVout) continue;
      const address = await this.resolveAddressFromVout({ vout: prevVout });
      const normalized = this.normalizeAddress(address);
      if (!normalized) continue;
      const watchers = params.watchers.get(normalized);
      if (!watchers?.length) continue;
      const valueSats = this.toSatoshis(prevVout.value);
      for (const watcher of watchers) {
        if (!this.directionEnabled(watcher.direction, "input")) {
          continue;
        }
        events.push(
          this.buildPrimitive({
            watcher,
            block: params.block,
            tx: params.tx,
            txIndex: params.txIndex,
            direction: "input",
            index: vinIndex,
            utxo: {
              txid: vin.txid as BitcoinTxId,
              vout: vin.vout,
            },
            valueSats,
          }),
        );
      }
    }
    return events;
  }

  private async resolveAddressFromVout(
    params: ResolveAddressParams,
  ): Promise<string | undefined> {
    const direct = this.extractAddressFromScript(params.vout);
    if (direct) return direct;
    if (!params.vout.scriptPubKey.hex) return undefined;
    const decoded = await this.rpcClient.decodeScript(
      params.vout.scriptPubKey.hex,
    );
    return decoded.address ?? decoded.p2pkh ?? decoded.p2sh ?? undefined;
  }

  private extractAddressFromScript(vout: BitcoinVout): string | undefined {
    const script = vout.scriptPubKey;
    if (script.address) return script.address;
    if (script.addresses?.length) return script.addresses[0];
    return undefined;
  }

  private buildWatcherMap(entries: PrimitiveEntryType[]): WatcherMap {
    const map: WatcherMap = new Map();
    for (const entry of entries) {
      const trimmedAddress = entry.primitive.watchAddress.trim();
      const normalized = this.normalizeAddress(trimmedAddress);
      if (!normalized) {
        console.warn(
          `[bitcoin] primitive ${entry.primitive.name} missing watch address`,
        );
        continue;
      }
      const watcher: Watcher = {
        entry,
        direction: entry.primitive.direction ?? "both",
        normalizedAddress: normalized,
        originalAddress: trimmedAddress,
      };
      const existing = map.get(normalized) ?? [];
      existing.push(watcher);
      map.set(normalized, existing);
    }
    return map;
  }

  private normalizeAddress(address: string | undefined): string | undefined {
    if (!address) return undefined;
    const trimmed = address.trim();
    if (trimmed.length === 0) return undefined;
    if (
      trimmed.startsWith("bc1") ||
      trimmed.startsWith("tb1") ||
      trimmed.startsWith("bcrt1")
    ) {
      return trimmed.toLowerCase();
    }
    return trimmed;
  }

  private directionEnabled(
    configured: BitcoinPrimitiveDirection,
    actual: PrimitiveEventDirection,
  ): boolean {
    if (configured === "both") return true;
    if (configured === "inputs") return actual === "input";
    if (configured === "outputs") return actual === "output";
    return false;
  }

  private toSatoshis(amountBtc: number): number {
    return Math.round(amountBtc * SATOSHIS_PER_BTC);
  }

  private buildPrimitive(params: BuildPrimitiveParams): PrimitiveType {
    const payloadDirection = params.direction;
    return {
      syncProtocol: {
        name: params.watcher.entry.syncProtocol,
        blockNumber: Number(params.block.height),
        transactionHash: params.tx.txid,
        transactionIndex: params.txIndex,
        contractAddress: params.watcher.originalAddress,
        logIndex: params.index,
      },
      primitive: params.watcher.entry.primitive.name,
      output: {
        payloadType: payloadDirection === "output"
          ? "UTXO_CREATED"
          : "UTXO_SPENT",
        payload: {
          direction: payloadDirection,
          address: params.watcher.originalAddress,
          transactionId: params.tx.txid,
          index: params.index,
          valueSats: params.valueSats,
          utxo: params.utxo,
          label: params.watcher.entry.primitive.label ?? '',
        },
      },
    };
  }

  private async getTransactionFromCache(
    params: TransactionLookupParams,
  ): Promise<BitcoinTransaction | undefined> {
    // TODO: use a more efficient and bounded cache
    if (params.cache.has(params.txid)) {
      return params.cache.get(params.txid);
    }
    const tx = await this.rpcClient.getRawTransaction(params.txid);
    if (tx) {
      params.cache.set(params.txid, tx);
    }
    return tx;
  }

  @bound
  *getLatestPage(
    knownLastPage: undefined | Page,
  ): Operation<Page> {
    const latestHeight = yield* call(() => this.rpcClient.getBlockCount());
    const safeHeight = Math.max(
      0,
      latestHeight - this.config.syncProtocol.confirmationDepth,
    );
    if (knownLastPage != null && safeHeight <= Number(knownLastPage)) {
      return knownLastPage;
    }
    return this.asPage(safeHeight);
  }

  @bound
  previousInterval(nextIntervalStart: Page): PageRange<Page> {
    const step = this.stepSize();
    const start = Number(nextIntervalStart) - step - 1;
    return this.intervalFromStart(this.asPage(Math.max(start, 0)));
  }

  @bound
  nextInterval(prevIntervalEnd: Page): PageRange<Page> {
    const start = Number(prevIntervalEnd) + 1;
    return this.intervalFromStart(this.asPage(start));
  }

  @bound
  intervalFromStart(start: Page): PageRange<Page> {
    const normalizedStart = Math.max(Number(start), 0);
    const step = this.stepSize();
    const fromPage = this.asPage(normalizedStart);
    const toPage = this.asPage(normalizedStart + step);
    return {
      from: fromPage,
      to: toPage,
    };
  }

  private stepSize(): number {
    return this.config.syncProtocol.stepSize ?? 25;
  }

  private asPage(value: number): Page {
    return value as Page;
  }
}

type BitcoinRpcClientOptions = {
  url: string;
  username?: string | null;
  password?: string | null;
};

type BitcoinRpcRequest = {
  method: string;
  params?: unknown[];
};

type BitcoinDecodedScript = {
  address?: string;
  p2pkh?: string;
  p2sh?: string;
};

export class BitcoinRpcClient {
  private readonly options: BitcoinRpcClientOptions;
  private nextId = 0;

  constructor(options: BitcoinRpcClientOptions) {
    this.options = options;
  }

  async getBlockCount(): Promise<number> {
    return await this.call<number>({ method: "getblockcount" });
  }

  async getBlockByHeight(height: number): Promise<BitcoinBlock> {
    const hash = await this.call<string>({
      method: "getblockhash",
      params: [height],
    });
    const block = await this.call<BitcoinBlock>({
      method: "getblock",
      params: [hash, 2],
    });
    return {
      ...block,
      hash: block.hash as BitcoinBlockHash,
      height: block.height as Page,
    };
  }

  async getRawTransaction(txid: string): Promise<BitcoinTransaction> {
    return await this.call<BitcoinTransaction>({
      method: "getrawtransaction",
      params: [txid, true],
    });
  }

  async decodeScript(scriptHex: string): Promise<BitcoinDecodedScript> {
    return await this.call<BitcoinDecodedScript>({
      method: "decodescript",
      params: [scriptHex],
    });
  }

  private async call<TResult>(
    request: BitcoinRpcRequest,
  ): Promise<TResult> {
    const response = await fetch(this.options.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.nextId,
        method: request.method,
        params: request.params ?? [],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Bitcoin RPC ${request.method} failed (${response.status}): ${body}`,
      );
    }
    const payload = await response.json();
    if (payload.error) {
      throw new Error(
        `Bitcoin RPC error for ${request.method}: ${
          JSON.stringify(payload.error)
        }`,
      );
    }
    return payload.result as TResult;
  }

  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (this.options.username && this.options.password) {
      const credentials = `${this.options.username}:${this.options.password}`;
      headers.Authorization = `Basic ${btoa(credentials)}`;
    }
    return headers;
  }
}

