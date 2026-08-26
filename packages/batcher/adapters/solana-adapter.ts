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
import type { RateLimitKeyStrategy } from "../core/rate-limiter.ts";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// ========================================
// Capacity Exchange Client (Dust Sponsor)
// ========================================

/**
 * Client for the SundaeSwap capacity exchange pattern.
 * The user partially signs a transaction, then this client sends it to
 * a CES server which adds the fee payer signature and returns the
 * finalized transaction ready for submission.
 *
 * Preserved as a standalone utility for operators who want the CES/dust-sponsor
 * flow; the default `SolanaAdapter` below uses the fee-payer sponsor model.
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
// Solana Adapter (fee-payer sponsor)
// =======================================

/** Solana ComputeBudget program — wallets add priority-fee instructions here. */
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111",
);

/**
 * ComputeBudget instruction discriminators (the first byte of `ix.data`).
 * Only `SetComputeUnitPrice` costs the fee payer anything beyond the base fee.
 */
const CB_REQUEST_HEAP_FRAME = 1;
const CB_SET_COMPUTE_UNIT_LIMIT = 2;
const CB_SET_COMPUTE_UNIT_PRICE = 3;
const CB_SET_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 4;

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
   * a submitted tx must target this program (or ComputeBudget, bounded by
   * `maxPriorityFeeMicroLamports`) — the core security scoping: it auto-rejects
   * System transfers, token moves, etc., since those target other programs.
   */
  targetProgramId: string;
  /**
   * Cap on `SetComputeUnitPrice`, in micro-lamports per compute unit.
   *
   * The **sponsor is the fee payer, so it pays the prioritization fee** — an
   * uncapped price is user-controlled spend from the sponsor's balance, and a
   * single transaction can drain it. Defaults to `0n`: any priority-fee
   * instruction is rejected outright, which is correct for a local validator
   * and for any chain where the batcher isn't competing for blockspace.
   *
   * Operators who need priority fees should raise this deliberately. Note the
   * actual lamports spent are `price × computeUnitLimit / 1e6`, so a non-zero
   * cap here should be chosen against the limit the program actually requests
   * (200k CU per instruction by default, 1.4M max).
   */
  maxPriorityFeeMicroLamports?: bigint | number;
  /** Sync protocol name for event filtering */
  syncProtocolName?: string;
  /** Max transactions submitted per batch cycle */
  maxBatchSize?: number;
  /**
   * Allow the sponsor (fee payer) to also appear inside an instruction's
   * account list (e.g. as the rent payer for a PDA the sponsored program
   * creates). Defaults to false — the strict fee-payer-only posture used by
   * pure transfer/log programs (e.g. SPL Memo). Per-program scoping
   * (`targetProgramId`) still confines the sponsor to the one configured
   * program either way.
   */
  allowSponsorAsInstructionAccount?: boolean;
  /**
   * How `/send-input` rate limit keys are derived for this adapter.
   *
   * Defaults to `"ip"`, matching the batcher's own default when no adapter
   * declares a strategy — existing deployments keep the behaviour they have.
   *
   * `"ip-and-address"` is the meaningful setting for a sponsor when the
   * batcher's `globalMaxRequests` is larger than its per-identity
   * `maxRequests`. The target-global bucket caps total sponsor volume, while a
   * verified wallet receives the lower identity allowance. The shared IP uses
   * the global ceiling, so one wallet can exhaust its own allowance without
   * blocking every user behind the same venue, office, or carrier NAT.
   *
   * Identity buckets are consumed only after `verifySignature` rejects any
   * `input.address` that did not sign, so an attacker cannot poison another
   * wallet's bucket or mint composite buckets with forged addresses.
   */
  rateLimitKeyStrategy?: RateLimitKeyStrategy;
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
  private readonly allowSponsorAsInstructionAccount: boolean;
  private readonly maxPriorityFeeMicroLamports: bigint;
  private readonly rateLimitKeyStrategy: RateLimitKeyStrategy;
  public readonly maxBatchSize: number;
  private readonly logger: AdapterLogger;

  constructor(config: SolanaAdapterConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.sponsor = Keypair.fromSecretKey(bs58.decode(config.batcherSecretKey));
    this.targetProgramId = new PublicKey(config.targetProgramId);
    this.syncProtocolName = config.syncProtocolName ?? "parallelSolana";
    this.maxBatchSize = config.maxBatchSize ?? 10;
    this.allowSponsorAsInstructionAccount =
      config.allowSponsorAsInstructionAccount ?? false;
    this.maxPriorityFeeMicroLamports = BigInt(
      config.maxPriorityFeeMicroLamports ?? 0,
    );
    this.rateLimitKeyStrategy = config.rateLimitKeyStrategy ?? "ip";
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

  getRateLimitKeyStrategy(): RateLimitKeyStrategy {
    return this.rateLimitKeyStrategy;
  }

  async getBlockNumber(): Promise<bigint> {
    return BigInt(await this.connection.getSlot("confirmed"));
  }

  /**
   * Verify the user's authorization: the partially-signed tx must carry a valid
   * signature from at least one non-fee-payer (the user), every present
   * signature must verify (the fee-payer slot is still empty here), and
   * `input.address` must be one of those signers.
   *
   * That last check is what binds the submission to the claimed identity.
   * Without it the batcher records — and rate-limits — under an address that
   * never signed anything, so anyone can submit under someone else's name.
   */
  async verifySignature(input: DefaultBatcherInput): Promise<boolean> {
    try {
      const tx = this.deserialize(input.input);
      const userSigners = tx.signatures.filter(
        (s) => !s.publicKey.equals(this.sponsor.publicKey),
      );
      if (userSigners.length === 0) return false;
      if (userSigners.some((s) => s.signature === null)) return false;

      // Throws on a malformed address → caught below → rejected.
      const claimed = new PublicKey(input.address);
      if (!userSigners.some((s) => s.publicKey.equals(claimed))) {
        this.logger.log(
          `verifySignature rejected: claimed address ${input.address} did not sign`,
        );
        return false;
      }

      // verify all present signatures; the missing fee-payer sig is allowed
      return tx.verifySignatures(false);
    } catch (e) {
      this.logger.log(`verifySignature failed: ${String(e)}`);
      return false;
    }
  }

  /**
   * Structural safety so the sponsor cannot be drained:
   *  1. fee payer == our sponsor;
   *  2. every instruction targets the configured program, or ComputeBudget
   *     within `maxPriorityFeeMicroLamports`;
   *  3. the sponsor appears only as fee payer, never in an instruction's accounts.
   *
   * Volume is NOT bounded here. Solana charges 5000 lamports per signature; a
   * sponsored transaction has at least the user's and sponsor's signatures and
   * therefore costs at least 10000 lamports. Operators must configure the
   * batcher's target-global rate limit for any non-local deployment.
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
      const pid = ix.programId;
      // Wallets (e.g. Phantom) routinely inject a ComputeBudget priority-fee
      // instruction when signing, so it can't simply be banned — but the sponsor
      // pays that fee, so it must be bounded rather than waved through.
      // ComputeBudget instructions carry no accounts, so the sponsor-account
      // check below doesn't apply to them.
      if (pid.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
        const budgetCheck = this.validateComputeBudgetIx(ix.data);
        if (!budgetCheck.valid) return budgetCheck;
        continue;
      }
      if (!pid.equals(this.targetProgramId)) {
        return {
          valid: false,
          error:
            `instruction targets ${pid.toBase58()}; this batcher only sponsors ` +
            `${this.targetProgramId.toBase58()} (and ComputeBudget)`,
        };
      }
      // Defense-in-depth: by default the sponsor must appear ONLY as the fee
      // payer. Programs that need the sponsor to fund rent (PDA creation) opt
      // in via `allowSponsorAsInstructionAccount`; per-program scoping above
      // still confines the sponsor to the configured program.
      if (
        !this.allowSponsorAsInstructionAccount &&
        ix.keys.some((k) => k.pubkey.equals(this.sponsor.publicKey))
      ) {
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
    // 5000 lamports per SIGNATURE, not per transaction: a sponsored tx always
    // carries at least two (the user's and the sponsor's fee-payer slot), so
    // counting transactions underestimated the sponsor's cost by ~2x. Count the
    // real signature slots, falling back to 2 for anything undecodable.
    let lamports = 0n;
    for (const txBase64 of data.transactions) {
      if (!txBase64) continue;
      try {
        lamports += BigInt(5000 * this.deserialize(txBase64).signatures.length);
      } catch {
        lamports += 10_000n;
      }
    }
    return lamports;
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
    const failures: string[] = [];
    for (const txBase64 of data.transactions) {
      if (!txBase64) continue;
      const tx = this.deserialize(txBase64);
      tx.partialSign(this.sponsor); // fills the fee-payer signature slot
      try {
        const sig = await this.connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        signatures.push(sig);
        this.logger.log(`Sponsored + submitted Solana tx: ${sig}`);
      } catch (e) {
        // Don't abort the loop: these are independent transactions, and throwing
        // here used to discard the signatures of everything already submitted,
        // leaving them on-chain but unreported (so unconfirmable and liable to
        // be resubmitted). Log, keep going, and surface a failure only if the
        // whole batch failed.
        this.logger.log(`Failed to submit a sponsored Solana tx: ${String(e)}`);
        failures.push(String(e));
      }
    }
    if (signatures.length === 0) {
      // Carry the per-transaction texts, don't just log them. The batcher reads
      // this message to tell an environment failure from a verdict about the
      // inputs (`BatchProcessor.isInfraFailure`): a bare constant matches
      // nothing, so an outage of our own RPC was charged to every input's
      // bounded retry budget and the requests were eventually deleted as
      // RETRIES_EXHAUSTED — real input loss caused by our own downtime.
      // Genuine chain verdicts read as verdicts either way, so they keep
      // charging exactly as before.
      throw new Error(
        "[Solana] no transaction in the batch could be submitted" +
          (failures.length > 0 ? `: ${failures.join("; ")}` : ""),
      );
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

  /**
   * Bound what a ComputeBudget instruction can cost the sponsor. Only
   * `SetComputeUnitPrice` moves money; the rest are size/limit hints. Unknown
   * discriminators are rejected rather than assumed harmless, so a future
   * ComputeBudget instruction can't slip through un-audited.
   */
  private validateComputeBudgetIx(data: Uint8Array): ValidationResult {
    const buf = Buffer.from(data);
    if (buf.length === 0) {
      return { valid: false, error: "empty ComputeBudget instruction" };
    }
    switch (buf[0]) {
      case CB_SET_COMPUTE_UNIT_PRICE: {
        // u64 little-endian micro-lamports/CU at offset 1.
        if (buf.length < 9) {
          return { valid: false, error: "malformed SetComputeUnitPrice instruction" };
        }
        const price = buf.readBigUInt64LE(1);
        if (price > this.maxPriorityFeeMicroLamports) {
          return {
            valid: false,
            error:
              `priority fee of ${price} micro-lamports/CU exceeds this batcher's ` +
              `cap of ${this.maxPriorityFeeMicroLamports} (the sponsor pays it)`,
          };
        }
        return { valid: true };
      }
      case CB_REQUEST_HEAP_FRAME:
      case CB_SET_COMPUTE_UNIT_LIMIT:
      case CB_SET_LOADED_ACCOUNTS_DATA_SIZE_LIMIT:
        return { valid: true };
      default:
        return {
          valid: false,
          error: `unsupported ComputeBudget instruction (discriminator ${buf[0]})`,
        };
    }
  }
}
