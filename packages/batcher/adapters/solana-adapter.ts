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
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

export interface SolanaBatchPayload {
  /** Base64-encoded, user-partially-signed serialized transactions */
  transactions: string[];
}

export interface SolanaAdapterConfig {
  /** Solana JSON-RPC URL */
  rpcUrl: string;
  /** Base58-encoded 64-byte secret key for the sponsor (fee payer) wallet */
  batcherSecretKey: string;
  /**
   * The single program this batcher instance will sponsor. Every instruction in
   * a submitted tx must target this program — the core security scoping: it
   * auto-rejects System transfers, token moves, ComputeBudget priority-fee
   * abuse, etc., since those target other programs.
   */
  targetProgramId: string;
  /** Sync protocol name for event filtering */
  syncProtocolName?: string;
  /** Max transactions submitted per batch cycle */
  maxBatchSize?: number;
}

/**
 * Solana **fee-payer sponsor** batcher (gasless relayer):
 * the user builds and partially signs a Solana transaction whose fee payer is
 * this batcher's sponsor key; the batcher validates it (§ validateInput), adds
 * the fee-payer signature, and submits it. The user pays 0 SOL. The result is
 * read back by the sync primitives — the batcher authors no blob.
 *
 * Scoped per program (`targetProgramId`), like EffectstreamL2 is per contract.
 */
export class SolanaAdapter implements BlockchainAdapter<SolanaBatchPayload> {
  private readonly connection: Connection;
  private readonly sponsor: Keypair;
  private readonly targetProgramId: PublicKey;
  private readonly syncProtocolName: string;
  public readonly maxBatchSize: number;
  private readonly logger: AdapterLogger;

  constructor(config: SolanaAdapterConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.sponsor = Keypair.fromSecretKey(bs58.decode(config.batcherSecretKey));
    this.targetProgramId = new PublicKey(config.targetProgramId);
    this.syncProtocolName = config.syncProtocolName ?? "parallelSolana";
    this.maxBatchSize = config.maxBatchSize ?? 10;
    this.logger = new AdapterLogger("SolanaAdapter");
  }

  getChainName(): string {
    return "Solana";
  }

  /** The real sponsor (fee-payer) public key. */
  getAccountAddress(): string {
    return this.sponsor.publicKey.toBase58();
  }

  isReady(): boolean {
    return true;
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  async getBlockNumber(): Promise<bigint> {
    return BigInt(await this.connection.getSlot("confirmed"));
  }

  /**
   * Verify the user's authorization: the partially-signed tx must carry a valid
   * signature from at least one non-fee-payer (the user), and every present
   * signature must verify. (The fee-payer slot is still empty here.)
   */
  async verifySignature(input: DefaultBatcherInput): Promise<boolean> {
    try {
      const tx = this.deserialize(input.input);
      const userSigners = tx.signatures.filter(
        (s) => !s.publicKey.equals(this.sponsor.publicKey),
      );
      if (userSigners.length === 0) return false;
      if (userSigners.some((s) => s.signature === null)) return false;
      // verify all present signatures; the missing fee-payer sig is allowed
      return tx.verifySignatures(false);
    } catch (e) {
      this.logger.log(`verifySignature failed: ${String(e)}`);
      return false;
    }
  }

  /**
   * Structural safety so the sponsor cannot be drained, regardless of any
   * operator policy layered on top:
   *  1. fee payer == our sponsor;
   *  2. every instruction targets the configured program;
   *  3. the sponsor appears only as fee payer, never in an instruction's accounts.
   */
  async validateInput(input: DefaultBatcherInput): Promise<ValidationResult> {
    let tx: Transaction;
    try {
      tx = this.deserialize(input.input);
    } catch (e) {
      return { valid: false, error: `Malformed transaction: ${String(e)}` };
    }

    if (!tx.feePayer || !tx.feePayer.equals(this.sponsor.publicKey)) {
      return { valid: false, error: "fee payer must be the batcher sponsor" };
    }
    for (const ix of tx.instructions) {
      if (!ix.programId.equals(this.targetProgramId)) {
        return {
          valid: false,
          error:
            `only instructions to ${this.targetProgramId.toBase58()} are sponsored`,
        };
      }
      if (ix.keys.some((k) => k.pubkey.equals(this.sponsor.publicKey))) {
        return {
          valid: false,
          error: "sponsor account must appear only as the fee payer",
        };
      }
    }
    return { valid: true };
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<SolanaBatchPayload> | null {
    if (inputs.length === 0) return null;
    const selectedInputs = inputs.slice(0, this.maxBatchSize);
    return {
      selectedInputs,
      data: { transactions: selectedInputs.map((i) => i.input) },
    };
  }

  async estimateBatchFee(
    data: SolanaBatchPayload,
  ): Promise<string | bigint> {
    // 5000 lamports per signature; each sponsored tx has >= 1 signature.
    return BigInt(5000 * data.transactions.length);
  }

  /**
   * Add the sponsor's fee-payer signature to each user-signed tx and submit it.
   * One independent transaction per request (no blob; recent-blockhash relay).
   */
  async submitBatch(
    data: SolanaBatchPayload,
    _fee: string | bigint,
  ): Promise<BlockchainHash> {
    const signatures: BlockchainHash[] = [];
    for (const txBase64 of data.transactions) {
      if (!txBase64) continue;
      const tx = this.deserialize(txBase64);
      tx.partialSign(this.sponsor); // fills the fee-payer signature slot
      const sig = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      signatures.push(sig);
      this.logger.log(`Sponsored + submitted Solana tx: ${sig}`);
    }
    return signatures[signatures.length - 1] ?? "";
  }

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60000,
  ): Promise<BlockchainTransactionReceipt> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const st = await this.connection.getSignatureStatus(hash, {
        searchTransactionHistory: true,
      });
      const v = st.value;
      if (v && (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized")) {
        return {
          hash,
          blockNumber: BigInt(v.slot ?? 0),
          status: v.err ? 0 : 1,
        };
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("Solana transaction confirmation timed out");
  }

  private deserialize(base64Tx: string): Transaction {
    return Transaction.from(Buffer.from(base64Tx, "base64"));
  }
}
