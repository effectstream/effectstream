import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { AdapterLogger } from "./adapter-logger.ts";

export interface CelestiaBlob {
  namespace: string;
  data: string;
  share_version: number;
}

export interface CelestiaBatchPayload {
  blob: CelestiaBlob;
  rawData: string;
  inputKey: string;
}

export type CelestiaNetwork = "devnet" | "mainnet";

export interface CelestiaAdapterConfig {
  rpcUrl: string;
  namespace: string;
  authToken?: string;
  network?: CelestiaNetwork;
  fee?: number;
  gasLimit?: number;
  gasPrice?: number;
  gas?: number;
  maxGasPrice?: number;
  txPriority?: number;
  maxBlobBytes?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  syncProtocolName?: string;
}

const RATE_LIMIT_PATTERNS = [
  "429",
  "Too Many Requests",
  "Unavailable",
  "ResourceExhausted",
];

const DEFAULT_MAX_BLOB_BYTES = 1.5 * 1024 * 1024;

interface BlobSubmitResult {
  txhash?: string;
  height?: number | string;
}

export class CelestiaAdapter
  implements BlockchainAdapter<CelestiaBatchPayload> {
  private readonly config: CelestiaAdapterConfig;
  private readonly namespaceB64: string;
  private readonly txConfig: Record<string, unknown>;
  private readonly maxBlobBytes: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly syncProtocolName: string;
  private readonly accountAddress: string;
  private readonly log = new AdapterLogger("Celestia");
  private ready = false;

  constructor(config: CelestiaAdapterConfig) {
    if (!config.rpcUrl) {
      throw new Error("CelestiaAdapter: rpcUrl is required");
    }
    if (!config.namespace) {
      throw new Error("CelestiaAdapter: namespace is required");
    }
    this.config = config;
    this.namespaceB64 = CelestiaAdapter.namespaceToBase64(config.namespace);
    this.txConfig = this.buildTxConfig();
    this.maxBlobBytes = config.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES;
    this.maxRetries = config.maxRetries ?? 4;
    this.baseDelayMs = config.baseDelayMs ?? 1500;
    this.syncProtocolName = config.syncProtocolName ?? "parallelCelestia";
    this.accountAddress = `celestia:${config.namespace.replace(/^0x/, "")}`;
    void this.probeReadiness();
  }

  getChainName(): string {
    return "celestia";
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  getAccountAddress(): string {
    return this.accountAddress;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getBlockNumber(): Promise<bigint> {
    const head = await this.rpcCall<{ header: { height: string | number } }>(
      "header.NetworkHead",
      [],
    );
    const heightStr = String(head.header.height);
    return BigInt(heightStr);
  }

  verifySignature(_input: DefaultBatcherInput): boolean {
    return true;
  }

  validateInput(input: DefaultBatcherInput): ValidationResult {
    if (typeof input.input !== "string" || input.input.length === 0) {
      return { valid: false, error: "Celestia blob input must be a non-empty string" };
    }
    const byteLength = Buffer.byteLength(input.input, "utf8");
    if (byteLength > this.maxBlobBytes) {
      return {
        valid: false,
        error: `Blob exceeds max size: ${byteLength} > ${this.maxBlobBytes} bytes`,
      };
    }
    return { valid: true };
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<CelestiaBatchPayload> | null {
    if (inputs.length === 0) return null;
    const first = inputs[0]!;
    const dataB64 = Buffer.from(first.input, "utf8").toString("base64");
    return {
      selectedInputs: [first],
      data: {
        blob: {
          namespace: this.namespaceB64,
          data: dataB64,
          share_version: 0,
        },
        rawData: first.input,
        inputKey: `${first.address}:${first.timestamp}`,
      },
    };
  }

  estimateBatchFee(_data: CelestiaBatchPayload): bigint {
    if ((this.config.network ?? "devnet") !== "mainnet") {
      return BigInt(this.config.fee ?? 2000);
    }
    return BigInt(this.config.fee ?? 0);
  }

  async submitBatch(
    data: CelestiaBatchPayload,
    _fee: string | bigint,
  ): Promise<BlockchainHash> {
    const result = await this.rpcCall<BlobSubmitResult | number>(
      "blob.Submit",
      [[data.blob], this.txConfig],
    );

    const { txhash, height } = this.normalizeSubmitResult(result);
    this.lastReceipt = {
      hash: txhash,
      blockNumber: BigInt(height),
      status: 1,
    };
    this.log.log(
      `Submitted blob (input=${data.inputKey}) → tx=${txhash} height=${height}`,
    );
    return txhash;
  }

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    _timeout?: number,
  ): Promise<BlockchainTransactionReceipt> {
    if (this.lastReceipt && this.lastReceipt.hash === hash) {
      const receipt = this.lastReceipt;
      this.lastReceipt = undefined;
      return receipt;
    }
    const head = await this.getBlockNumber();
    return { hash, blockNumber: head, status: 1 };
  }

  private lastReceipt?: BlockchainTransactionReceipt;

  private normalizeSubmitResult(
    result: BlobSubmitResult | number | string,
  ): { txhash: string; height: number } {
    if (typeof result === "number") {
      return { txhash: `celestia-h${result}`, height: result };
    }
    if (typeof result === "string") {
      const parsed = Number(result);
      const height = Number.isFinite(parsed) ? parsed : 0;
      return { txhash: `celestia-h${height}`, height };
    }
    if (result && typeof result === "object") {
      const heightRaw = (result as BlobSubmitResult).height;
      const heightNum = typeof heightRaw === "number"
        ? heightRaw
        : Number(heightRaw ?? 0);
      const height = Number.isFinite(heightNum) ? heightNum : 0;
      const txhash = (result as BlobSubmitResult).txhash ??
        `celestia-h${height}`;
      return { txhash, height };
    }
    throw new Error(
      `Celestia blob.Submit returned unexpected result: ${JSON.stringify(result)}`,
    );
  }

  private buildTxConfig(): Record<string, unknown> {
    if ((this.config.network ?? "devnet") !== "mainnet") {
      return {
        fee: this.config.fee ?? 2000,
        gasLimit: this.config.gasLimit ?? 100000,
      };
    }
    const cfg: Record<string, unknown> = {};
    if (this.config.gasPrice !== undefined) cfg["gas_price"] = this.config.gasPrice;
    if (this.config.gas !== undefined) cfg["gas"] = this.config.gas;
    if (this.config.maxGasPrice !== undefined) {
      cfg["max_gas_price"] = this.config.maxGasPrice;
    }
    if (this.config.txPriority !== undefined) {
      cfg["tx_priority"] = this.config.txPriority;
    }
    return cfg;
  }

  private rpcHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.authToken) {
      headers["Authorization"] = `Bearer ${this.config.authToken}`;
    }
    return headers;
  }

  private static isRateLimit(msg: string): boolean {
    return RATE_LIMIT_PATTERNS.some((pattern) => msg.includes(pattern));
  }

  private async rpcCall<T = unknown>(
    method: string,
    params: unknown[],
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(this.config.rpcUrl, {
          method: "POST",
          headers: this.rpcHeaders(),
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const json = await res.json() as { error?: unknown; result?: unknown };
        if (json.error) {
          const msg = JSON.stringify(json.error);
          if (
            attempt < this.maxRetries && CelestiaAdapter.isRateLimit(msg)
          ) {
            const delay = this.baseDelayMs * 2 ** attempt + Math.random() * 500;
            this.log.warn(
              `${method} rate-limited (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${Math.round(delay)}ms`,
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new Error(msg);
        }
        return json.result as T;
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message ?? String(e);
        if (attempt < this.maxRetries && CelestiaAdapter.isRateLimit(msg)) {
          const delay = this.baseDelayMs * 2 ** attempt + Math.random() * 500;
          this.log.warn(
            `${method} network rate-limit (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${Math.round(delay)}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  private async probeReadiness(): Promise<void> {
    try {
      await this.rpcCall<{ header: { height: string } }>("header.NetworkHead", []);
      this.ready = true;
      this.log.log(`ready (rpc=${this.config.rpcUrl}, ns=${this.config.namespace})`);
    } catch (e) {
      this.log.warn(`readiness probe failed: ${(e as Error).message ?? e}`);
    }
  }

  private static namespaceToBase64(hex: string): string {
    const clean = hex.replace(/^0x/, "");
    const bytes = new Uint8Array(29);
    const hexBytes = (clean.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16));
    bytes.set(hexBytes, 29 - hexBytes.length);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
}
