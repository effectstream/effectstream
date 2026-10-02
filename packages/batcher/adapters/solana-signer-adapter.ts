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
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

// =============================================================================
// Solana operator-signer adapter
// =============================================================================
//
// `SolanaAdapter` co-signs, as fee payer, transactions that a USER built and
// signed. This adapter is the other shape: the batcher holds an OPERATOR key
// and builds, signs (as fee payer and sole signer) and submits transactions
// from instruction lists — e.g. a bridge relayer's `[create recipient token
// account if missing, Release]`.
//
// An operator key that signs whatever reaches the batcher is a drain, so three
// gates sit in front of it:
//   1. `verifySignature`: the input must carry an Ed25519 signature BY THE
//      OPERATOR KEY over the canonical input bytes (`buildSolanaSignerMessage`).
//      A batcher with its HTTP server enabled therefore cannot be used by
//      anyone else to make the operator sign instructions.
//   2. `validateInput`: every instruction must target an allow-listed program
//      (ComputeBudget is implicitly allowed, priority fee capped), only the
//      operator may be a signer, and the transaction must fit the packet size.
//   3. Preflight simulation on submit (`skipPreflight: false`).
//
// Delivery is at-least-once: a transaction whose confirmation could not be
// observed is rebuilt with a FRESH blockhash on the next attempt. Programs must
// make their instructions idempotent (e.g. a receipt PDA per withdrawal id).
// `waitForTransactionReceipt` narrows the window: it reports a transaction as
// definitively expired (safe to resubmit) once its blockhash can no longer land.

/** Solana ComputeBudget program — always allowed, bounded by the price cap. */
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111",
);

/** ComputeBudget instruction discriminators (first byte of `ix.data`). */
const CB_REQUEST_HEAP_FRAME = 1;
const CB_SET_COMPUTE_UNIT_LIMIT = 2;
const CB_SET_COMPUTE_UNIT_PRICE = 3;
const CB_SET_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 4;

/** Solana's per-transaction compute ceiling. */
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
/** Default per-instruction compute budget the runtime grants. */
const DEFAULT_CU_PER_INSTRUCTION = 200_000;
/** Base fee per signature, in lamports. */
const LAMPORTS_PER_SIGNATURE = 5_000n;
/**
 * Upper bound on waiting for a known blockhash window to close (≈150 blocks,
 * about 60–90 s on a healthy cluster), so a stalled validator cannot hang the
 * receipt wait forever.
 */
const MAX_EXPIRY_WAIT_MS = 180_000;

/** Sanity bounds applied before any parsing work (HTTP-reachable input). */
const MAX_INPUT_CHARS = 16_384;
const MAX_INSTRUCTIONS = 64;
const MAX_KEYS_PER_INSTRUCTION = 64;

/** `AddressType.SOLANA` in `@effectstream/utils`. */
const ADDRESS_TYPE_SOLANA = 9;

/** Domain tag of the signed message; bump on any change to its layout. */
export const SOLANA_SIGNER_MESSAGE_DOMAIN = "effectstream-solana-signer/v1";

/** Commitment levels the adapter accepts. */
export type SolanaSignerCommitment = "processed" | "confirmed" | "finalized";

const COMMITMENT_RANK: Record<SolanaSignerCommitment, number> = {
  processed: 0,
  confirmed: 1,
  finalized: 2,
};

/** One account meta of an instruction, in JSON form. */
export interface SolanaSignerAccountMeta {
  /** Base58 public key. */
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

/** One instruction, in JSON form. */
export interface SolanaSignerInstruction {
  /** Base58 program id; must be allow-listed (or ComputeBudget). */
  programId: string;
  keys: SolanaSignerAccountMeta[];
  /** Instruction data, standard padded base64. */
  dataBase64: string;
}

/**
 * The batcher input (`DefaultBatcherInput.input`, JSON): the instructions of
 * ONE transaction, in order. The operator is its fee payer and only signer.
 */
export interface SolanaSignerInput {
  instructions: SolanaSignerInstruction[];
  /**
   * Optional compute-unit limit. The adapter prepends a `SetComputeUnitLimit`
   * instruction; do not also pass one in `instructions`.
   */
  computeUnitLimit?: number;
}

export interface SolanaSignerAdapterConfig {
  /** Solana JSON-RPC URL. */
  rpcUrl: string;
  /**
   * Base58-encoded 64-byte secret key of the operator: the fee payer and the
   * only signer of every transaction. Never logged.
   */
  operatorSecretKey: string;
  /**
   * Programs the operator may invoke (top-level instructions). ComputeBudget
   * is always allowed. List every other program explicitly — including the
   * associated-token-account program when a release creates the recipient's
   * token account. CPIs made BY an allowed program are not restricted here.
   */
  allowedProgramIds: string[];
  /** Sync protocol name used by `wait-effectstream-processed`. */
  syncProtocolName?: string;
  /**
   * Cap on a `SetComputeUnitPrice` instruction inside an input, in
   * micro-lamports per compute unit. The operator pays it. Defaults to `0n`:
   * any priority-fee instruction is refused.
   */
  maxPriorityFeeMicroLamports?: bigint | number;
  /**
   * Commitment for blockhashes, preflight and receipts. Default `confirmed`.
   */
  commitment?: SolanaSignerCommitment;
  /**
   * Inputs (= transactions) per batch. Defaults to `1`, so every receipt
   * describes exactly one input's transaction. With more, the receipt's
   * `status` is `0` if ANY transaction of the batch failed on chain; the
   * per-transaction outcome is in the receipt's `signatures` field.
   */
  maxBatchSize?: number;
  /** Receipt poll interval in ms. Default 1000. */
  receiptPollIntervalMs?: number;
}

/** Batch data: the selected inputs, one transaction each. */
export interface SolanaSignerBatchPayload {
  /**
   * The same array the batcher selected. `submitBatch` removes the inputs
   * whose transaction could not be submitted, so the batcher retries only
   * those (the `selectedInputs` mutation contract of `BatchProcessor`).
   */
  selectedInputs: DefaultBatcherInput[];
}

/** Per-transaction outcome carried by the receipt. */
export interface SolanaSignerTransactionOutcome {
  signature: string;
  slot: bigint;
  /** `null` on success; the RPC's transaction error otherwise. */
  err: unknown;
}

/** A parsed and validated input. */
interface ParsedSignerInput {
  instructions: TransactionInstruction[];
  /** Effective SetComputeUnitPrice, if any. */
  priceMicroLamports: bigint;
  /** Effective compute-unit limit (explicit, or the runtime default). */
  computeUnitLimit: number;
}

// -----------------------------------------------------------------------------
// Helpers for callers (the relayer side)
// -----------------------------------------------------------------------------

/** Convert a web3.js instruction into the adapter's JSON form. */
export function toSolanaSignerInstruction(
  ix: TransactionInstruction,
): SolanaSignerInstruction {
  return {
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    dataBase64: Buffer.from(ix.data).toString("base64"),
  };
}

/**
 * Duck-typed, not `instanceof`: the caller's `@solana/web3.js` may be another
 * module instance than the batcher's.
 */
function isWeb3Instruction(
  ix: TransactionInstruction | SolanaSignerInstruction,
): ix is TransactionInstruction {
  return typeof (ix as { programId: unknown }).programId !== "string";
}

/**
 * Canonical JSON for an input: fixed key order, no whitespace. Accepts web3.js
 * instructions or the JSON form.
 */
export function encodeSolanaSignerInput(input: {
  instructions: Array<TransactionInstruction | SolanaSignerInstruction>;
  computeUnitLimit?: number;
}): string {
  const instructions = input.instructions.map((ix) => {
    const j = isWeb3Instruction(ix) ? toSolanaSignerInstruction(ix) : ix;
    return {
      programId: j.programId,
      keys: j.keys.map((k) => ({
        pubkey: k.pubkey,
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      dataBase64: j.dataBase64,
    };
  });
  return JSON.stringify(
    input.computeUnitLimit === undefined
      ? { instructions }
      : { instructions, computeUnitLimit: input.computeUnitLimit },
  );
}

/**
 * The exact bytes the operator signs: UTF-8 of the JSON array
 * `[domain, target|null, timestamp, input]`. JSON string escaping keeps the
 * fields unambiguous, and the domain tag keeps the signature from being valid
 * for any other message format.
 */
export function buildSolanaSignerMessage(
  input: Pick<DefaultBatcherInput, "input" | "timestamp" | "target">,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      SOLANA_SIGNER_MESSAGE_DOMAIN,
      input.target ?? null,
      input.timestamp,
      input.input,
    ]),
  );
}

/**
 * Build a ready-to-batch input signed by the operator key.
 *
 * `operatorSecretKey` is the 64-byte secret key (or its base58 form). The
 * returned `address` is the operator's public key, which `verifySignature`
 * requires.
 */
export function signSolanaSignerInput(opts: {
  input: SolanaSignerInput | string;
  operatorSecretKey: Uint8Array | string;
  timestamp?: string;
  target?: string;
}): DefaultBatcherInput & { signature: string } {
  const secret = typeof opts.operatorSecretKey === "string"
    ? bs58.decode(opts.operatorSecretKey)
    : opts.operatorSecretKey;
  const operator = Keypair.fromSecretKey(secret);
  const inputString = typeof opts.input === "string"
    ? opts.input
    : encodeSolanaSignerInput(opts.input);
  const timestamp = opts.timestamp ?? Date.now().toString();
  const message = buildSolanaSignerMessage({
    input: inputString,
    timestamp,
    target: opts.target,
  });
  const signature = bs58.encode(
    nacl.sign.detached(message, operator.secretKey),
  );
  const signed = {
    address: operator.publicKey.toBase58(),
    addressType: ADDRESS_TYPE_SOLANA as DefaultBatcherInput["addressType"],
    input: inputString,
    signature,
    timestamp,
  } as DefaultBatcherInput & { signature: string };
  if (opts.target !== undefined) signed.target = opts.target;
  return signed;
}

// -----------------------------------------------------------------------------
// Adapter
// -----------------------------------------------------------------------------

/**
 * Batcher adapter that submits **operator-signed** Solana transactions built
 * from instruction lists. See the file header for the security model.
 */
export class SolanaSignerAdapter
  implements BlockchainAdapter<SolanaSignerBatchPayload> {
  private readonly connection: Connection;
  private readonly operator: Keypair;
  private readonly allowedProgramIds: PublicKey[];
  private readonly syncProtocolName: string;
  private readonly maxPriorityFeeMicroLamports: bigint;
  private readonly commitment: SolanaSignerCommitment;
  private readonly receiptPollIntervalMs: number;
  public readonly maxBatchSize: number;
  private readonly logger = new AdapterLogger("SolanaSignerAdapter");
  /** signature → last block height at which its blockhash can still land. */
  private readonly lastValidBlockHeights = new Map<string, number>();

  constructor(config: SolanaSignerAdapterConfig) {
    let secret: Uint8Array;
    try {
      secret = bs58.decode(config.operatorSecretKey);
    } catch {
      // Never echo the key (or the decoder's message, which may quote it).
      throw new Error(
        "SolanaSignerAdapter: operatorSecretKey is not valid base58",
      );
    }
    if (secret.length !== 64) {
      throw new Error(
        `SolanaSignerAdapter: operatorSecretKey must decode to 64 bytes (got ${secret.length})`,
      );
    }
    try {
      this.operator = Keypair.fromSecretKey(secret);
    } catch {
      throw new Error(
        "SolanaSignerAdapter: operatorSecretKey is not a valid Ed25519 keypair",
      );
    }

    if (
      !Array.isArray(config.allowedProgramIds) ||
      config.allowedProgramIds.length === 0
    ) {
      throw new Error(
        "SolanaSignerAdapter: allowedProgramIds must list at least one program",
      );
    }
    this.allowedProgramIds = config.allowedProgramIds.map((id) => {
      try {
        return new PublicKey(id);
      } catch {
        throw new Error(
          `SolanaSignerAdapter: allowedProgramIds contains an invalid public key: ${id}`,
        );
      }
    });

    const commitment = config.commitment ?? "confirmed";
    if (!(commitment in COMMITMENT_RANK)) {
      throw new Error(
        `SolanaSignerAdapter: unsupported commitment "${commitment}"`,
      );
    }
    this.commitment = commitment;
    this.connection = new Connection(config.rpcUrl, commitment);
    this.syncProtocolName = config.syncProtocolName ?? "parallelSolana";
    this.maxPriorityFeeMicroLamports = BigInt(
      config.maxPriorityFeeMicroLamports ?? 0,
    );
    if (this.maxPriorityFeeMicroLamports < 0n) {
      throw new Error(
        "SolanaSignerAdapter: maxPriorityFeeMicroLamports must be >= 0",
      );
    }
    this.maxBatchSize = config.maxBatchSize ?? 1;
    if (!Number.isInteger(this.maxBatchSize) || this.maxBatchSize < 1) {
      throw new Error(
        "SolanaSignerAdapter: maxBatchSize must be a positive integer",
      );
    }
    this.receiptPollIntervalMs = config.receiptPollIntervalMs ?? 1000;
  }

  getChainName(): string {
    return "Solana";
  }

  /** The operator (fee payer and signer) public key, base58. */
  getAccountAddress(): string {
    return this.operator.publicKey.toBase58();
  }

  isReady(): boolean {
    return true;
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  async getBlockNumber(): Promise<bigint> {
    return BigInt(await this.connection.getSlot(this.commitment));
  }

  /**
   * Accept only inputs signed by the operator key: `input.address` must be the
   * operator's public key, and `input.signature` (base58, 64 bytes) must be a
   * valid Ed25519 signature over `buildSolanaSignerMessage(input)`.
   */
  verifySignature(input: DefaultBatcherInput): boolean {
    try {
      if (input.address !== this.getAccountAddress()) {
        this.logger.log(
          `verifySignature rejected: address ${input.address} is not the operator`,
        );
        return false;
      }
      if (!input.signature) {
        this.logger.log("verifySignature rejected: no signature");
        return false;
      }
      const signature = bs58.decode(input.signature);
      if (signature.length !== 64) {
        this.logger.log(
          `verifySignature rejected: signature is ${signature.length} bytes, not 64`,
        );
        return false;
      }
      const ok = nacl.sign.detached.verify(
        buildSolanaSignerMessage(input),
        signature,
        this.operator.publicKey.toBytes(),
      );
      if (!ok) {
        this.logger.log(
          "verifySignature rejected: not a valid operator signature over this input",
        );
      }
      return ok;
    } catch (e) {
      this.logger.log(`verifySignature failed: ${String(e)}`);
      return false;
    }
  }

  /**
   * Structural checks, before the input is queued: well-formed JSON, every
   * program allow-listed (ComputeBudget bounded), only the operator signs, and
   * the transaction fits Solana's packet size.
   */
  validateInput(input: DefaultBatcherInput): ValidationResult {
    try {
      const parsed = this.parseInput(input.input);
      // Size check with a placeholder blockhash (same length as a real one).
      this.buildTransaction(parsed, PublicKey.default.toBase58())
        .serialize({ requireAllSignatures: false, verifySignatures: false });
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<SolanaSignerBatchPayload> | null {
    if (inputs.length === 0) return null;
    const selectedInputs = inputs.slice(0, this.maxBatchSize);
    return { selectedInputs, data: { selectedInputs } };
  }

  /**
   * Lamports the operator pays: 5000 per transaction (one signature) plus any
   * priority fee (`price × limit / 1e6`, rounded up).
   */
  estimateBatchFee(data: SolanaSignerBatchPayload): bigint {
    let lamports = 0n;
    for (const input of data.selectedInputs) {
      lamports += LAMPORTS_PER_SIGNATURE;
      try {
        const parsed = this.parseInput(input.input);
        if (parsed.priceMicroLamports > 0n) {
          lamports += (parsed.priceMicroLamports *
                BigInt(parsed.computeUnitLimit) + 999_999n) / 1_000_000n;
        }
      } catch {
        // Invalid inputs fail in submitBatch; the base fee is an upper bound
        // for what they could cost (they are never sent).
      }
    }
    return lamports;
  }

  /**
   * Build, sign (operator = fee payer and signer) and send one transaction per
   * selected input, each with a fresh blockhash.
   *
   * Inputs whose transaction cannot be built or sent are removed from
   * `data.selectedInputs`, so only they are charged a retry. If nothing could
   * be sent, the per-transaction error texts are carried in the thrown message:
   * the batcher reads it to tell an RPC outage (park, no retry charged) from a
   * verdict on the inputs (`BatchProcessor.isInfraFailure`).
   *
   * Returns the signatures joined by `,`, in the order of the remaining
   * `selectedInputs`, so each input's callback gets its own signature.
   */
  async submitBatch(
    data: SolanaSignerBatchPayload,
    _fee: string | bigint,
  ): Promise<BlockchainHash> {
    const inputs = [...data.selectedInputs];
    const signatures: string[] = [];
    const failed = new Set<DefaultBatcherInput>();
    const failures: string[] = [];

    for (const input of inputs) {
      try {
        const parsed = this.parseInput(input.input);
        const { blockhash, lastValidBlockHeight } = await this.connection
          .getLatestBlockhash(this.commitment);
        const tx = this.buildTransaction(parsed, blockhash);
        tx.sign(this.operator);
        const signature = await this.connection.sendRawTransaction(
          tx.serialize(),
          { skipPreflight: false, preflightCommitment: this.commitment },
        );
        this.lastValidBlockHeights.set(signature, lastValidBlockHeight);
        signatures.push(signature);
        this.logger.log(`Operator-signed Solana tx submitted: ${signature}`);
      } catch (e) {
        // Independent transactions: keep going, so a later success is not
        // lost behind an earlier failure.
        this.logger.log(`Failed to submit an operator-signed Solana tx: ${String(e)}`);
        failed.add(input);
        failures.push(String(e));
      }
    }

    if (signatures.length === 0) {
      throw new Error(
        "[SolanaSigner] no transaction in the batch could be submitted" +
          (failures.length > 0 ? `: ${failures.join("; ")}` : ""),
      );
    }

    if (failed.size > 0) {
      for (let i = data.selectedInputs.length - 1; i >= 0; i--) {
        if (failed.has(data.selectedInputs[i])) {
          data.selectedInputs.splice(i, 1);
        }
      }
    }
    return signatures.join(",");
  }

  /**
   * Wait until every signature in `hash` (comma-separated) reaches the
   * configured commitment. `status` is 1 only if all succeeded on chain;
   * `blockNumber` is the highest slot; `signatures` has each outcome.
   *
   * For a transaction this adapter submitted, the wait runs to a DEFINITE
   * answer (landed, or blockhash expired) rather than an ambiguous timeout,
   * up to `max(timeout, 180 s)`. An expired transaction can never land, so the
   * batcher's resubmission (with a fresh blockhash) cannot double-execute it.
   */
  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60_000,
  ): Promise<BlockchainTransactionReceipt> {
    const start = Date.now();
    const deadlines = {
      unknownWindow: start + timeout,
      knownWindow: start + Math.max(timeout, MAX_EXPIRY_WAIT_MS),
    };
    const outcomes: SolanaSignerTransactionOutcome[] = [];
    for (const signature of hash.split(",").filter((s) => s.length > 0)) {
      try {
        outcomes.push(await this.waitForSignature(signature, deadlines));
      } finally {
        this.lastValidBlockHeights.delete(signature);
      }
    }
    if (outcomes.length === 0) {
      throw new Error("[SolanaSigner] no signature to wait for");
    }
    const blockNumber = outcomes.reduce(
      (max, o) => (o.slot > max ? o.slot : max),
      0n,
    );
    return {
      hash,
      blockNumber,
      status: outcomes.every((o) => o.err === null) ? 1 : 0,
      signatures: outcomes,
    };
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private async waitForSignature(
    signature: string,
    deadlines: { unknownWindow: number; knownWindow: number },
  ): Promise<SolanaSignerTransactionOutcome> {
    const wanted = COMMITMENT_RANK[this.commitment];
    const lastValid = this.lastValidBlockHeights.get(signature);
    const deadline = lastValid === undefined
      ? deadlines.unknownWindow
      : deadlines.knownWindow;
    while (true) {
      const st = await this.connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      const v = st.value;
      if (v) {
        const reached: SolanaSignerCommitment = v.confirmationStatus ??
          (v.confirmations === null ? "finalized" : "processed");
        if (COMMITMENT_RANK[reached] >= wanted) {
          return { signature, slot: BigInt(v.slot ?? 0), err: v.err ?? null };
        }
      } else if (lastValid !== undefined) {
        const height = await this.connection.getBlockHeight(this.commitment);
        if (height > lastValid) {
          // Re-check once: it may have landed between the two calls.
          const again = await this.connection.getSignatureStatus(signature, {
            searchTransactionHistory: true,
          });
          if (!again.value) {
            throw new Error(
              `[SolanaSigner] transaction ${signature} expired before confirmation ` +
                `(block height ${height} > last valid ${lastValid}); it can no longer land`,
            );
          }
          continue;
        }
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `[SolanaSigner] transaction ${signature} confirmation timed out`,
        );
      }
      await new Promise((r) => setTimeout(r, this.receiptPollIntervalMs));
    }
  }

  private buildTransaction(
    parsed: ParsedSignerInput,
    recentBlockhash: string,
  ): Transaction {
    const tx = new Transaction();
    tx.feePayer = this.operator.publicKey;
    tx.recentBlockhash = recentBlockhash;
    tx.add(...parsed.instructions);
    return tx;
  }

  private isAllowedProgram(programId: PublicKey): boolean {
    return this.allowedProgramIds.some((p) => p.equals(programId));
  }

  /**
   * Parse and validate an input string. Throws an `Error` whose message is the
   * refusal reason.
   */
  private parseInput(raw: string): ParsedSignerInput {
    if (typeof raw !== "string" || raw.length === 0) {
      throw new Error("Malformed input: expected a JSON string");
    }
    if (raw.length > MAX_INPUT_CHARS) {
      throw new Error(
        `Malformed input: ${raw.length} characters exceeds ${MAX_INPUT_CHARS}`,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Malformed input: invalid JSON (${String(e)})`);
    }
    if (!isPlainObject(json)) {
      throw new Error("Malformed input: expected a JSON object");
    }
    assertOnlyKeys(json, ["instructions", "computeUnitLimit"], "input");

    const { instructions, computeUnitLimit } = json as {
      instructions?: unknown;
      computeUnitLimit?: unknown;
    };
    if (!Array.isArray(instructions) || instructions.length === 0) {
      throw new Error(
        "Malformed input: `instructions` must be a non-empty array",
      );
    }
    if (instructions.length > MAX_INSTRUCTIONS) {
      throw new Error(
        `Malformed input: ${instructions.length} instructions exceeds ${MAX_INSTRUCTIONS}`,
      );
    }

    const seenBudget = new Set<number>();
    let priceMicroLamports = 0n;
    let explicitLimit: number | undefined;
    const out: TransactionInstruction[] = [];

    if (computeUnitLimit !== undefined) {
      if (
        typeof computeUnitLimit !== "number" ||
        !Number.isInteger(computeUnitLimit) ||
        computeUnitLimit < 1 ||
        computeUnitLimit > MAX_COMPUTE_UNIT_LIMIT
      ) {
        throw new Error(
          `Malformed input: computeUnitLimit must be an integer in 1..${MAX_COMPUTE_UNIT_LIMIT}`,
        );
      }
      explicitLimit = computeUnitLimit;
      seenBudget.add(CB_SET_COMPUTE_UNIT_LIMIT);
      out.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
      );
    }

    let programInstructionCount = 0;
    instructions.forEach((rawIx, i) => {
      const where = `instructions[${i}]`;
      if (!isPlainObject(rawIx)) {
        throw new Error(`Malformed input: ${where} must be an object`);
      }
      assertOnlyKeys(rawIx, ["programId", "keys", "dataBase64"], where);
      const { programId, keys, dataBase64 } = rawIx as {
        programId?: unknown;
        keys?: unknown;
        dataBase64?: unknown;
      };
      const pid = parsePublicKey(programId, `${where}.programId`);
      const data = parseBase64(dataBase64, `${where}.dataBase64`);
      if (!Array.isArray(keys)) {
        throw new Error(`Malformed input: ${where}.keys must be an array`);
      }
      if (keys.length > MAX_KEYS_PER_INSTRUCTION) {
        throw new Error(
          `Malformed input: ${where}.keys has more than ${MAX_KEYS_PER_INSTRUCTION} entries`,
        );
      }
      const metas = keys.map((rawKey, k) => {
        const kw = `${where}.keys[${k}]`;
        if (!isPlainObject(rawKey)) {
          throw new Error(`Malformed input: ${kw} must be an object`);
        }
        assertOnlyKeys(rawKey, ["pubkey", "isSigner", "isWritable"], kw);
        const { pubkey, isSigner, isWritable } = rawKey as {
          pubkey?: unknown;
          isSigner?: unknown;
          isWritable?: unknown;
        };
        if (typeof isSigner !== "boolean" || typeof isWritable !== "boolean") {
          throw new Error(
            `Malformed input: ${kw}.isSigner and .isWritable must be booleans`,
          );
        }
        const pk = parsePublicKey(pubkey, `${kw}.pubkey`);
        if (isSigner && !pk.equals(this.operator.publicKey)) {
          throw new Error(
            `${kw}: only the operator can sign (got signer ${pk.toBase58()})`,
          );
        }
        return { pubkey: pk, isSigner, isWritable };
      });

      if (pid.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
        if (metas.length > 0) {
          throw new Error(
            `${where}: a ComputeBudget instruction takes no accounts`,
          );
        }
        const budget = this.checkComputeBudget(data, where, seenBudget);
        if (budget.price !== undefined) priceMicroLamports = budget.price;
        if (budget.limit !== undefined) explicitLimit = budget.limit;
      } else {
        if (!this.isAllowedProgram(pid)) {
          throw new Error(
            `${where} targets ${pid.toBase58()}, which is not in this adapter's allowedProgramIds (plus ComputeBudget)`,
          );
        }
        programInstructionCount++;
      }
      out.push(
        new TransactionInstruction({ programId: pid, keys: metas, data }),
      );
    });

    if (programInstructionCount === 0) {
      throw new Error(
        "Malformed input: at least one non-ComputeBudget instruction is required",
      );
    }

    return {
      instructions: out,
      priceMicroLamports,
      computeUnitLimit: explicitLimit ??
        Math.min(
          DEFAULT_CU_PER_INSTRUCTION * programInstructionCount,
          MAX_COMPUTE_UNIT_LIMIT,
        ),
    };
  }

  /**
   * Bound a ComputeBudget instruction. Only `SetComputeUnitPrice` moves money
   * (capped by `maxPriorityFeeMicroLamports`). Unknown discriminators and
   * duplicates (which the runtime rejects anyway) are refused.
   */
  private checkComputeBudget(
    data: Buffer,
    where: string,
    seen: Set<number>,
  ): { price?: bigint; limit?: number } {
    if (data.length === 0) {
      throw new Error(`${where}: empty ComputeBudget instruction`);
    }
    const kind = data[0];
    if (seen.has(kind)) {
      throw new Error(
        `${where}: duplicate ComputeBudget instruction (discriminator ${kind})`,
      );
    }
    seen.add(kind);
    switch (kind) {
      case CB_SET_COMPUTE_UNIT_PRICE: {
        if (data.length !== 9) {
          throw new Error(`${where}: malformed SetComputeUnitPrice`);
        }
        const price = data.readBigUInt64LE(1);
        if (price > this.maxPriorityFeeMicroLamports) {
          throw new Error(
            `${where}: priority fee of ${price} micro-lamports/CU exceeds this adapter's cap of ${this.maxPriorityFeeMicroLamports} (the operator pays it)`,
          );
        }
        return { price };
      }
      case CB_SET_COMPUTE_UNIT_LIMIT: {
        if (data.length !== 5) {
          throw new Error(`${where}: malformed SetComputeUnitLimit`);
        }
        const limit = data.readUInt32LE(1);
        if (limit < 1 || limit > MAX_COMPUTE_UNIT_LIMIT) {
          throw new Error(
            `${where}: compute unit limit ${limit} is outside 1..${MAX_COMPUTE_UNIT_LIMIT}`,
          );
        }
        return { limit };
      }
      case CB_REQUEST_HEAP_FRAME:
      case CB_SET_LOADED_ACCOUNTS_DATA_SIZE_LIMIT:
        if (data.length !== 5) {
          throw new Error(`${where}: malformed ComputeBudget instruction`);
        }
        return {};
      default:
        throw new Error(
          `${where}: unsupported ComputeBudget instruction (discriminator ${kind})`,
        );
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Refuse unknown fields, so a misspelt option never silently does nothing. */
function assertOnlyKeys(
  obj: Record<string, unknown>,
  allowed: string[],
  where: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new Error(`Malformed input: unknown field \`${key}\` in ${where}`);
    }
  }
}

function parsePublicKey(v: unknown, where: string): PublicKey {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Malformed input: ${where} must be a base58 string`);
  }
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(v);
  } catch {
    throw new Error(`Malformed input: ${where} is not valid base58`);
  }
  if (bytes.length !== 32) {
    throw new Error(
      `Malformed input: ${where} must decode to 32 bytes (got ${bytes.length})`,
    );
  }
  return new PublicKey(bytes);
}

/** Standard, padded base64 only (round-trips exactly). */
function parseBase64(v: unknown, where: string): Buffer {
  if (typeof v !== "string") {
    throw new Error(`Malformed input: ${where} must be a base64 string`);
  }
  const buf = Buffer.from(v, "base64");
  if (buf.toString("base64") !== v) {
    throw new Error(`Malformed input: ${where} is not canonical padded base64`);
  }
  return buf;
}
