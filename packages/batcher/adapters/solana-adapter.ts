import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
} from "./adapter.ts";
import { AdapterLogger } from "./adapter-logger.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

export interface SolanaBatchPayload {
  /** Base58-encoded serialized transactions */
  transactions: string[];
  /** Total lamports in the batch */
  totalLamports: number;
}

export interface SolanaAdapterConfig {
  /** Solana JSON-RPC URL */
  rpcUrl: string;
  /** Base58-encoded secret key for the batcher wallet (fee payer) */
  batcherSecretKey?: string;
  /** Optional capacity exchange server URL for dust-sponsor mode */
  capacityExchangeUrl?: string;
  /** Sync protocol name for event filtering */
  syncProtocolName?: string;
  /** Max transactions per batch */
  maxBatchSize?: number;
}

// ========================================
// Capacity Exchange Client (Dust Sponsor)
// ========================================

/**
 * Client for the SundaeSwap capacity exchange pattern.
 * The user partially signs a transaction, then this client sends it to
 * a CES server which adds the fee payer signature and returns the
 * finalized transaction ready for submission.
 *
 * Pattern reference:
 * https://github.com/SundaeSwap-finance/capacity-exchange/blob/main/examples/react-vite/src/App.tsx#L128-L144
 */
export class CapacityExchangeClient {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Send a partial (user-signed) transaction to the CES server.
   * The server adds the fee payer and returns the finalized base58 transaction.
   */
  async balanceTx(
    partialTxBase58: string,
  ): Promise<string> {
    const res = await fetch(`${this.url}/balance-tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction: partialTxBase58,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[Solana] Capacity exchange error (${res.status}): ${text}`,
      );
    }

    const json = await res.json();
    return json.transaction as string;
  }
}

// =======================================
// Solana RPC helper
// =======================================

async function solanaRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(
      `[Solana] RPC error [${method}]: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }
  return json.result as T;
}

// =======================================
// Solana Adapter
// =======================================

/**
 * Solana batcher adapter supporting two modes:
 *
 * 1. **Backend pays gas**: The batcher keypair signs as fee payer and submits.
 *    The input `data` field contains a base58-encoded Solana transaction that
 *    has been signed by the user but with a dummy fee payer. The batcher
 *    replaces the fee payer, signs, and submits.
 *
 * 2. **Dust sponsor (capacity exchange)**: The user partially signs a
 *    transaction client-side. The batcher sends it to a CES server which
 *    adds the fee payer signature. The batcher then submits the result.
 *    This is inspired by the SundaeSwap capacity exchange pattern.
 */
export class SolanaAdapter implements BlockchainAdapter<SolanaBatchPayload> {
  private readonly rpcUrl: string;
  private readonly batcherSecretKey?: string;
  private readonly cesClient?: CapacityExchangeClient;
  private readonly syncProtocolName: string;
  public readonly maxBatchSize: number;
  private readonly logger: AdapterLogger;

  constructor(config: SolanaAdapterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.batcherSecretKey = config.batcherSecretKey;
    this.syncProtocolName = config.syncProtocolName ?? "parallelSolana";
    this.maxBatchSize = config.maxBatchSize ?? 50;
    this.logger = new AdapterLogger("SolanaAdapter");

    if (config.capacityExchangeUrl) {
      this.cesClient = new CapacityExchangeClient(
        config.capacityExchangeUrl,
      );
    }
  }

  getChainName(): string {
    return "Solana";
  }

  getAccountAddress(): string {
    return "solana-batcher";
  }

  isReady(): boolean {
    return !!this.batcherSecretKey || !!this.cesClient;
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  async getBlockNumber(): Promise<bigint> {
    const slot = await solanaRpc<number>(this.rpcUrl, "getSlot", [
      { commitment: "confirmed" },
    ]);
    return BigInt(slot);
  }

  async verifySignature(input: DefaultBatcherInput): Promise<boolean> {
    // For Solana, signature verification is done on-chain
    // For the batcher, we just check that the input has a signature
    return !!input.signature;
  }

  async validateInput(
    input: DefaultBatcherInput,
  ): Promise<ValidationResult> {
    try {
      const payload = JSON.parse(input.input);
      if (!payload.transaction && !payload.instructions) {
        return {
          valid: false,
          error: "Input must contain 'transaction' (base58) or 'instructions'",
        };
      }
      return { valid: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { valid: false, error: `Malformed JSON input: ${msg}` };
    }
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<SolanaBatchPayload> | null {
    if (inputs.length === 0) return null;

    const maxSize = this.maxBatchSize;
    const selectedInputs = inputs.slice(0, maxSize);
    const transactions = selectedInputs.map((input) => {
      const payload = JSON.parse(input.input);
      return payload.transaction ?? "";
    });

    return {
      selectedInputs,
      data: {
        transactions,
        totalLamports: 0,
      },
    };
  }

  async estimateBatchFee(
    _data: SolanaBatchPayload,
  ): Promise<string | bigint> {
    // Solana base fee is 5000 lamports per signature
    // Each transaction has at least 1 signature (fee payer)
    return BigInt(5000 * _data.transactions.length);
  }

  async submitBatch(
    data: SolanaBatchPayload,
    _fee: string | bigint,
  ): Promise<BlockchainHash> {
    const signatures: BlockchainHash[] = [];

    for (const txBase58 of data.transactions) {
      if (!txBase58) continue;

      let finalizedTx = txBase58;

      // If capacity exchange is configured, route through CES
      if (this.cesClient) {
        finalizedTx = await this.cesClient.balanceTx(txBase58);
      }

      // Submit via sendRawTransaction
      const sig = await solanaRpc<string>(
        this.rpcUrl,
        "sendRawTransaction",
        [
          finalizedTx,
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          },
        ],
      );

      signatures.push(sig);
      this.logger.log(`Submitted Solana tx: ${sig}`);
    }

    // Return the last transaction signature as the batch hash
    return signatures[signatures.length - 1] ?? "";
  }

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60000,
  ): Promise<BlockchainTransactionReceipt> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const result = await solanaRpc<{
          value: {
            slot: number;
            transaction: { signatures: string[] };
            meta: { err: unknown | null };
          } | null;
        }>(this.rpcUrl, "getTransaction", [
          hash,
          { encoding: "json", commitment: "confirmed" },
        ]);

        if (result.value) {
          return {
            hash,
            blockNumber: BigInt(result.value.slot),
            status: result.value.meta.err ? 0 : 1,
          };
        }
      } catch {
        // Transaction may not be indexed yet
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new Error("Solana transaction confirmation timed out");
  }
}
