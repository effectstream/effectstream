// SolanaSignerAdapter unit tests (PR-1 E5).
//
// No network is touched: the adapter's `connection` methods are stubbed per
// test, and the configured RPC URL is unroutable (port 1), so a missing stub
// fails loudly instead of reaching a real endpoint. Keypairs are generated in
// the test; nothing secret is logged or persisted.

import { expect, test } from "bun:test";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

import {
  buildSolanaSignerMessage,
  encodeSolanaSignerInput,
  SOLANA_SIGNER_MESSAGE_DOMAIN,
  signSolanaSignerInput,
  SolanaSignerAdapter,
  type SolanaSignerAdapterConfig,
  type SolanaSignerBatchPayload,
} from "./solana-signer-adapter.ts";
import { BatchProcessor } from "../core/batch-processor.ts";
import { Batcher, InputValidationError } from "../core/batcher.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const COMPUTE_BUDGET_ID = "ComputeBudget111111111111111111111111111111";

const operator = Keypair.generate();
const operatorSecretKey = bs58.encode(operator.secretKey);
const stranger = Keypair.generate();

function config(
  overrides: Partial<SolanaSignerAdapterConfig> = {},
): SolanaSignerAdapterConfig {
  return {
    rpcUrl: "http://127.0.0.1:1",
    operatorSecretKey,
    allowedProgramIds: [MEMO_PROGRAM_ID],
    syncProtocolName: "parallelSolanaRPC",
    ...overrides,
  };
}

function memoIx(text = "hello", signer: PublicKey = operator.publicKey) {
  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, "utf8"),
  });
}

/** A correctly signed input carrying `raw` (string) or the encoded payload. */
function signed(
  payload: Parameters<typeof encodeSolanaSignerInput>[0] | string,
  target?: string,
): DefaultBatcherInput {
  return signSolanaSignerInput({
    input: typeof payload === "string"
      ? payload
      : encodeSolanaSignerInput(payload),
    operatorSecretKey,
    target,
  });
}

// ── stubs ────────────────────────────────────────────────────────────────────

interface Stubs {
  blockhashCalls: number;
  sent: Transaction[];
  statuses: Map<string, { slot: number; err: unknown } | null>;
  blockHeight: number;
}

/**
 * Stub the RPC: `getLatestBlockhash` returns a new random blockhash per call;
 * `sendRawTransaction` decodes and records the wire tx and returns its real
 * first signature (or throws what `send` throws); statuses come from the map.
 */
function stubbed(
  adapter: SolanaSignerAdapter,
  opts: {
    send?: (tx: Transaction, call: number) => void;
    blockhash?: (call: number) => void;
  } = {},
): Stubs {
  const s: Stubs = {
    blockhashCalls: 0,
    sent: [],
    statuses: new Map(),
    blockHeight: 100,
  };
  // deno-lint-ignore no-explicit-any
  const conn = (adapter as any).connection;
  conn.getLatestBlockhash = async () => {
    const call = s.blockhashCalls++;
    opts.blockhash?.(call);
    return {
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 150,
    };
  };
  let sendCall = 0;
  conn.sendRawTransaction = async (wire: Uint8Array) => {
    const tx = Transaction.from(Buffer.from(wire));
    opts.send?.(tx, sendCall++);
    s.sent.push(tx);
    return bs58.encode(tx.signature!);
  };
  conn.getSignatureStatus = async (sig: string) => {
    const st = s.statuses.get(sig);
    return {
      context: { slot: 1 },
      value: st
        ? {
          slot: st.slot,
          confirmations: 1,
          err: st.err,
          confirmationStatus: "confirmed",
        }
        : null,
    };
  };
  conn.getBlockHeight = async () => s.blockHeight;
  return s;
}

const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);

async function thrownBy(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected a throw, but it resolved");
}

// ── config ───────────────────────────────────────────────────────────────────

test("config: rejects a non-base58 operator key without echoing it", () => {
  const bad = "0OIl-not-base58-secret";
  let message = "";
  try {
    new SolanaSignerAdapter(config({ operatorSecretKey: bad }));
  } catch (e) {
    message = messageOf(e);
  }
  expect(message).toContain("not valid base58");
  expect(message).not.toContain(bad);
});

test("config: rejects an operator key that is not 64 bytes", () => {
  expect(() =>
    new SolanaSignerAdapter(
      config({ operatorSecretKey: bs58.encode(operator.secretKey.slice(0, 32)) }),
    )
  ).toThrow("64 bytes");
});

test("config: rejects an empty or invalid program allow-list", () => {
  expect(() => new SolanaSignerAdapter(config({ allowedProgramIds: [] })))
    .toThrow("at least one program");
  expect(() =>
    new SolanaSignerAdapter(config({ allowedProgramIds: ["not-a-key!"] }))
  ).toThrow("invalid public key");
});

test("identity: operator address, chain name, readiness, sync protocol", () => {
  const adapter = new SolanaSignerAdapter(config());
  expect(adapter.getAccountAddress()).toBe(operator.publicKey.toBase58());
  expect(adapter.getChainName()).toBe("Solana");
  expect(adapter.isReady()).toBe(true);
  expect(adapter.getSyncProtocolName()).toBe("parallelSolanaRPC");
  expect(
    new SolanaSignerAdapter(config({ syncProtocolName: undefined }))
      .getSyncProtocolName(),
  ).toBe("parallelSolana");
  expect(adapter.maxBatchSize).toBe(1);
});

// ── verifySignature: only the operator key can authorize an input ────────────

test("verifySignature: accepts an input signed by the operator key", () => {
  const adapter = new SolanaSignerAdapter(config());
  const input = signed({ instructions: [memoIx()] }, "solanaOperator");
  expect(input.address).toBe(operator.publicKey.toBase58());
  expect(input.addressType).toBe(9);
  expect(adapter.verifySignature(input)).toBe(true);
});

test("verifySignature: the signed bytes are the documented canonical message", () => {
  const input = signed({ instructions: [memoIx()] }, "t");
  const expected = new TextEncoder().encode(
    JSON.stringify([SOLANA_SIGNER_MESSAGE_DOMAIN, "t", input.timestamp, input.input]),
  );
  expect(buildSolanaSignerMessage(input)).toEqual(expected);
  expect(
    nacl.sign.detached.verify(
      expected,
      bs58.decode(input.signature!),
      operator.publicKey.toBytes(),
    ),
  ).toBe(true);
});

test("signSolanaSignerInput: web3.js instructions, JSON form and pre-encoded string sign the same input", () => {
  const adapter = new SolanaSignerAdapter(config());
  const ix = memoIx("same bytes");
  const encoded = encodeSolanaSignerInput({ instructions: [ix], computeUnitLimit: 9_000 });
  const fromWeb3 = signSolanaSignerInput({
    input: { instructions: [ix], computeUnitLimit: 9_000 },
    operatorSecretKey: operator.secretKey,
    timestamp: "1",
  });
  const fromJson = signSolanaSignerInput({
    input: JSON.parse(encoded),
    operatorSecretKey,
    timestamp: "1",
  });
  const fromString = signSolanaSignerInput({ input: encoded, operatorSecretKey, timestamp: "1" });
  expect(fromWeb3.input).toBe(encoded);
  expect(fromJson.input).toBe(encoded);
  expect(fromString).toEqual(fromWeb3);
  expect(fromWeb3.target).toBeUndefined();
  expect(adapter.verifySignature(fromWeb3)).toBe(true);
  expect(adapter.validateInput(fromWeb3)).toEqual({ valid: true });
});

test("verifySignature: refuses a signature by another key (bad operator signature)", () => {
  const adapter = new SolanaSignerAdapter(config());
  const input = signed({ instructions: [memoIx()] });
  const forged = bs58.encode(
    nacl.sign.detached(buildSolanaSignerMessage(input), stranger.secretKey),
  );
  expect(adapter.verifySignature({ ...input, signature: forged })).toBe(false);
});

test("verifySignature: refuses an input claiming another address", () => {
  const adapter = new SolanaSignerAdapter(config());
  // Correctly self-signed by the stranger — still not the operator.
  const strangerInput = signSolanaSignerInput({
    input: encodeSolanaSignerInput({ instructions: [memoIx()] }),
    operatorSecretKey: stranger.secretKey,
  });
  expect(adapter.verifySignature(strangerInput)).toBe(false);
});

test("verifySignature: any change to input, timestamp or target breaks the signature", () => {
  const adapter = new SolanaSignerAdapter(config());
  const input = signed({ instructions: [memoIx("pay 1")] }, "a");
  const swapped = encodeSolanaSignerInput({ instructions: [memoIx("pay 1000")] });
  expect(adapter.verifySignature({ ...input, input: swapped })).toBe(false);
  expect(adapter.verifySignature({ ...input, timestamp: "0" })).toBe(false);
  expect(adapter.verifySignature({ ...input, target: "b" })).toBe(false);
  expect(adapter.verifySignature({ ...input, target: undefined })).toBe(false);
});

test("verifySignature: refuses missing, non-base58 and wrong-length signatures", () => {
  const adapter = new SolanaSignerAdapter(config());
  const input = signed({ instructions: [memoIx()] });
  expect(adapter.verifySignature({ ...input, signature: undefined })).toBe(false);
  expect(adapter.verifySignature({ ...input, signature: "0OIl" })).toBe(false);
  expect(
    adapter.verifySignature({ ...input, signature: bs58.encode(new Uint8Array(32)) }),
  ).toBe(false);
});

// ── validateInput ────────────────────────────────────────────────────────────

test("validateInput: accepts allow-listed instructions signed by the operator", () => {
  const adapter = new SolanaSignerAdapter(config());
  const res = adapter.validateInput(
    signed({ instructions: [memoIx()], computeUnitLimit: 50_000 }),
  );
  expect(res).toEqual({ valid: true });
});

test("validateInput: refuses an instruction to a program that is not allow-listed", () => {
  const adapter = new SolanaSignerAdapter(config());
  const transfer = SystemProgram.transfer({
    fromPubkey: operator.publicKey,
    toPubkey: stranger.publicKey,
    lamports: 1_000_000_000,
  });
  const res = adapter.validateInput(signed({ instructions: [memoIx(), transfer] }));
  expect(res.valid).toBe(false);
  expect(res.error).toContain("not in this adapter's allowedProgramIds");
  expect(res.error).toContain(SystemProgram.programId.toBase58());
});

test("validateInput: the ATA program is refused unless listed explicitly", () => {
  const ataIx = new TransactionInstruction({
    programId: new PublicKey(ATA_PROGRAM_ID),
    keys: [{ pubkey: operator.publicKey, isSigner: true, isWritable: true }],
    data: Buffer.from([1]),
  });
  const input = signed({ instructions: [ataIx, memoIx()] });
  expect(new SolanaSignerAdapter(config()).validateInput(input).valid).toBe(false);
  expect(
    new SolanaSignerAdapter(
      config({ allowedProgramIds: [MEMO_PROGRAM_ID, ATA_PROGRAM_ID] }),
    ).validateInput(input).valid,
  ).toBe(true);
});

test("validateInput: refuses a signer other than the operator", () => {
  const adapter = new SolanaSignerAdapter(config());
  const res = adapter.validateInput(
    signed({ instructions: [memoIx("x", stranger.publicKey)] }),
  );
  expect(res.valid).toBe(false);
  expect(res.error).toContain("only the operator can sign");
});

test("validateInput: ComputeBudget — price capped (default 0), limit allowed, duplicates and unknowns refused", () => {
  const strict = new SolanaSignerAdapter(config());
  const capped = new SolanaSignerAdapter(
    config({ maxPriorityFeeMicroLamports: 1_000n }),
  );
  const price = (p: number) =>
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: p });
  const limit = (u: number) => ComputeBudgetProgram.setComputeUnitLimit({ units: u });

  expect(strict.validateInput(signed({ instructions: [price(1), memoIx()] })).valid)
    .toBe(false);
  expect(capped.validateInput(signed({ instructions: [price(1_000), memoIx()] })).valid)
    .toBe(true);
  const over = capped.validateInput(signed({ instructions: [price(1_001), memoIx()] }));
  expect(over.valid).toBe(false);
  expect(over.error).toContain("exceeds this adapter's cap");

  expect(strict.validateInput(signed({ instructions: [limit(10_000), memoIx()] })).valid)
    .toBe(true);
  const dup = strict.validateInput(
    signed({ instructions: [limit(10_000), memoIx()], computeUnitLimit: 20_000 }),
  );
  expect(dup.valid).toBe(false);
  expect(dup.error).toContain("duplicate ComputeBudget");

  const unknown = strict.validateInput(signed({
    instructions: [
      { programId: COMPUTE_BUDGET_ID, keys: [], dataBase64: Buffer.from([9]).toString("base64") },
      memoIx(),
    ],
  }));
  expect(unknown.valid).toBe(false);
  expect(unknown.error).toContain("unsupported ComputeBudget");
});

test("validateInput: refuses malformed inputs", () => {
  const adapter = new SolanaSignerAdapter(config());
  const memo = encodeSolanaSignerInput({ instructions: [memoIx()] });
  const memoJson = JSON.parse(memo).instructions[0];
  const cases: Array<[string, string, string]> = [
    ["not JSON", "{instructions:", "invalid JSON"],
    ["a JSON array", "[]", "expected a JSON object"],
    ["no instructions", "{}", "non-empty array"],
    ["empty instructions", '{"instructions":[]}', "non-empty array"],
    ["an unknown field", JSON.stringify({ instructions: [memoJson], fee: 1 }), "unknown field `fee`"],
    [
      "an unknown instruction field",
      JSON.stringify({ instructions: [{ ...memoJson, accounts: [] }] }),
      "unknown field `accounts`",
    ],
    [
      "a bad program id",
      JSON.stringify({ instructions: [{ ...memoJson, programId: "xyz0" }] }),
      "programId is not valid base58",
    ],
    [
      "a short pubkey",
      JSON.stringify({
        instructions: [{
          ...memoJson,
          keys: [{ pubkey: bs58.encode(new Uint8Array(31)), isSigner: false, isWritable: false }],
        }],
      }),
      "must decode to 32 bytes",
    ],
    [
      "non-boolean flags",
      JSON.stringify({
        instructions: [{
          ...memoJson,
          keys: [{ pubkey: operator.publicKey.toBase58(), isSigner: "yes", isWritable: false }],
        }],
      }),
      "must be booleans",
    ],
    [
      "non-canonical base64",
      JSON.stringify({ instructions: [{ ...memoJson, dataBase64: "aGVsbG8" }] }),
      "not canonical padded base64",
    ],
    [
      "only ComputeBudget instructions",
      encodeSolanaSignerInput({
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 })],
      }),
      "at least one non-ComputeBudget instruction",
    ],
    [
      "an out-of-range computeUnitLimit",
      JSON.stringify({ instructions: [memoJson], computeUnitLimit: 1_400_001 }),
      "computeUnitLimit must be an integer",
    ],
    ["an oversized input", "x".repeat(20_000), "exceeds 16384"],
  ];
  for (const [label, raw, reason] of cases) {
    const res = adapter.validateInput(signed(raw));
    if (res.valid || !res.error?.includes(reason)) {
      throw new Error(`${label}: expected refusal containing "${reason}", got ${JSON.stringify(res)}`);
    }
  }
});

test("validateInput: refuses a transaction larger than a Solana packet", () => {
  const adapter = new SolanaSignerAdapter(config());
  const res = adapter.validateInput(signed({ instructions: [memoIx("m".repeat(1_200))] }));
  expect(res.valid).toBe(false);
  expect(res.error).toContain("too large");
});

// ── batch building and fees ──────────────────────────────────────────────────

test("buildBatchData: one input per batch by default; selectedInputs is shared with data", () => {
  const adapter = new SolanaSignerAdapter(config());
  expect(adapter.buildBatchData([])).toBeNull();
  const a = signed({ instructions: [memoIx("a")] });
  const b = signed({ instructions: [memoIx("b")] });
  const res = adapter.buildBatchData([a, b])!;
  expect(res.selectedInputs).toEqual([a]);
  expect(res.data.selectedInputs).toBe(res.selectedInputs);
});

test("estimateBatchFee: 5000 lamports per transaction plus any priority fee", () => {
  const adapter = new SolanaSignerAdapter(
    config({ maxPriorityFeeMicroLamports: 10_000n, maxBatchSize: 5 }),
  );
  const plain = signed({ instructions: [memoIx()] });
  const priced = signed({
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
      memoIx(),
    ],
    computeUnitLimit: 100_000,
  });
  // 10_000 µL/CU × 100_000 CU = 1_000 lamports
  expect(adapter.estimateBatchFee({ selectedInputs: [plain, priced] })).toBe(11_000n);
});

// ── submitBatch: happy-path assembly ─────────────────────────────────────────

test("submitBatch: operator is fee payer and only signer; instructions in order; CU limit first", async () => {
  const adapter = new SolanaSignerAdapter(config());
  const s = stubbed(adapter);
  const input = signed({ instructions: [memoIx("release 4")], computeUnitLimit: 60_000 });

  const sig = await adapter.submitBatch({ selectedInputs: [input] }, 0n);

  expect(s.sent).toHaveLength(1);
  const tx = s.sent[0];
  expect(sig).toBe(bs58.encode(tx.signature!));
  expect(tx.feePayer!.equals(operator.publicKey)).toBe(true);
  expect(tx.signatures).toHaveLength(1);
  expect(tx.signatures[0].publicKey.equals(operator.publicKey)).toBe(true);
  expect(tx.verifySignatures()).toBe(true);
  expect(tx.instructions.map((ix) => ix.programId.toBase58())).toEqual([
    COMPUTE_BUDGET_ID,
    MEMO_PROGRAM_ID,
  ]);
  expect(Buffer.from(tx.instructions[1].data).toString("utf8")).toBe("release 4");
});

test("submitBatch: a fresh blockhash for every transaction and every attempt", async () => {
  const adapter = new SolanaSignerAdapter(config({ maxBatchSize: 2 }));
  const s = stubbed(adapter);
  const batch = (): SolanaSignerBatchPayload => ({
    selectedInputs: [
      signed({ instructions: [memoIx("same")] }),
      signed({ instructions: [memoIx("same")] }),
    ],
  });
  await adapter.submitBatch(batch(), 0n);
  await adapter.submitBatch(batch(), 0n); // the retry of the same work
  expect(s.blockhashCalls).toBe(4);
  const hashes = new Set(s.sent.map((t) => t.recentBlockhash));
  expect(hashes.size).toBe(4);
});

test("submitBatch: comma-joined signatures map one-to-one onto the inputs", async () => {
  const adapter = new SolanaSignerAdapter(config({ maxBatchSize: 3 }));
  const s = stubbed(adapter);
  const inputs = ["a", "b", "c"].map((t) => signed({ instructions: [memoIx(t)] }));
  const hash = await adapter.submitBatch({ selectedInputs: [...inputs] }, 0n);
  expect(hash.split(",")).toEqual(s.sent.map((t) => bs58.encode(t.signature!)));
  expect(s.sent.map((t) => Buffer.from(t.instructions[0].data).toString())).toEqual([
    "a",
    "b",
    "c",
  ]);
});

// ── submitBatch: failure classification ──────────────────────────────────────

test("submitBatch: an RPC outage on every send is classified as INFRASTRUCTURE", async () => {
  const adapter = new SolanaSignerAdapter(config({ maxBatchSize: 2 }));
  stubbed(adapter, {
    send: () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8899");
    },
  });
  const error = await thrownBy(() =>
    adapter.submitBatch({
      selectedInputs: [signed({ instructions: [memoIx("a")] }), signed({ instructions: [memoIx("b")] })],
    }, 0n)
  );
  expect(BatchProcessor.isInfraFailure(error)).toBe(true);
  expect(messageOf(error)).toContain("[SolanaSigner] no transaction in the batch could be submitted");
  expect(messageOf(error)).toContain("ECONNREFUSED");
});

test("submitBatch: a blockhash fetch failure is also INFRASTRUCTURE", async () => {
  const adapter = new SolanaSignerAdapter(config());
  stubbed(adapter, {
    blockhash: () => {
      throw new Error("fetch failed");
    },
  });
  const error = await thrownBy(() =>
    adapter.submitBatch({ selectedInputs: [signed({ instructions: [memoIx()] })] }, 0n)
  );
  expect(BatchProcessor.isInfraFailure(error)).toBe(true);
});

test("submitBatch: a chain verdict (simulation failure) is NOT infrastructure", async () => {
  const adapter = new SolanaSignerAdapter(config());
  stubbed(adapter, {
    send: () => {
      throw new Error(
        "Transaction simulation failed: Error processing Instruction 1: custom program error: 0x6",
      );
    },
  });
  const error = await thrownBy(() =>
    adapter.submitBatch({ selectedInputs: [signed({ instructions: [memoIx()] })] }, 0n)
  );
  expect(BatchProcessor.isInfraFailure(error)).toBe(false);
  expect(messageOf(error)).toContain("custom program error: 0x6");
});

test("submitBatch: an input that fails re-validation is never sent", async () => {
  const adapter = new SolanaSignerAdapter(config());
  const s = stubbed(adapter);
  const bad = signed({ instructions: [memoIx("x", stranger.publicKey)] });
  const error = await thrownBy(() =>
    adapter.submitBatch({ selectedInputs: [bad] }, 0n)
  );
  expect(s.sent).toHaveLength(0);
  expect(messageOf(error)).toContain("only the operator can sign");
});

test("submitBatch: a partial failure removes only the failed input from selectedInputs", async () => {
  const adapter = new SolanaSignerAdapter(config({ maxBatchSize: 2 }));
  stubbed(adapter, {
    send: (_tx, call) => {
      if (call === 0) throw new Error("connect ECONNREFUSED 127.0.0.1:8899");
    },
  });
  const a = signed({ instructions: [memoIx("a")] });
  const b = signed({ instructions: [memoIx("b")] });
  const data = { selectedInputs: [a, b] };
  const hash = await adapter.submitBatch(data, 0n);
  expect(hash.split(",")).toHaveLength(1);
  expect(data.selectedInputs).toEqual([b]);
});

// ── waitForTransactionReceipt ────────────────────────────────────────────────

test("waitForTransactionReceipt: success → status 1 at the transaction's slot", async () => {
  const adapter = new SolanaSignerAdapter(config());
  const s = stubbed(adapter);
  const sig = await adapter.submitBatch(
    { selectedInputs: [signed({ instructions: [memoIx()] })] },
    0n,
  );
  s.statuses.set(sig, { slot: 42, err: null });
  const receipt = await adapter.waitForTransactionReceipt(sig, 1_000);
  expect(receipt.hash).toBe(sig);
  expect(receipt.blockNumber).toBe(42n);
  expect(receipt.status).toBe(1);
});

test("waitForTransactionReceipt: an on-chain failure → status 0", async () => {
  const adapter = new SolanaSignerAdapter(config());
  const s = stubbed(adapter);
  s.statuses.set("sigX", { slot: 7, err: { InstructionError: [1, { Custom: 6 }] } });
  const receipt = await adapter.waitForTransactionReceipt("sigX", 1_000);
  expect(receipt.status).toBe(0);
  expect(receipt.signatures[0].err).toEqual({ InstructionError: [1, { Custom: 6 }] });
});

test("waitForTransactionReceipt: several signatures → highest slot, status 0 if any failed", async () => {
  const adapter = new SolanaSignerAdapter(config());
  const s = stubbed(adapter);
  s.statuses.set("s1", { slot: 10, err: null });
  s.statuses.set("s2", { slot: 12, err: { InstructionError: [0, "X"] } });
  const receipt = await adapter.waitForTransactionReceipt("s1,s2", 1_000);
  expect(receipt.blockNumber).toBe(12n);
  expect(receipt.status).toBe(0);
  expect(receipt.signatures.map((o: { signature: string }) => o.signature)).toEqual(["s1", "s2"]);
});

test("waitForTransactionReceipt: an expired blockhash is reported as definitively not landed", async () => {
  const adapter = new SolanaSignerAdapter(config({ receiptPollIntervalMs: 5 }));
  const s = stubbed(adapter);
  const sig = await adapter.submitBatch(
    { selectedInputs: [signed({ instructions: [memoIx()] })] },
    0n,
  );
  s.blockHeight = 151; // lastValidBlockHeight is 150 in the stub
  const error = await thrownBy(() => adapter.waitForTransactionReceipt(sig, 10));
  expect(messageOf(error)).toContain("expired before confirmation");
});

test("waitForTransactionReceipt: an unknown signature times out", async () => {
  const adapter = new SolanaSignerAdapter(config({ receiptPollIntervalMs: 5 }));
  stubbed(adapter);
  const error = await thrownBy(() => adapter.waitForTransactionReceipt("never", 30));
  expect(messageOf(error)).toContain("confirmation timed out");
});

// ── the batcher's own gate and processor, with this adapter ──────────────────

class MemoryStorage implements BatcherStorage<DefaultBatcherInput> {
  readonly inputs: DefaultBatcherInput[] = [];
  async init(): Promise<void> {}
  async addInput(input: DefaultBatcherInput): Promise<void> {
    this.inputs.push(input);
  }
  async getAllInputs(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async removeProcessedInputs(): Promise<void> {}
  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    return { count: this.inputs.length, size: 0 };
  }
  async getInputsByTarget(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async incrementRetryCount(): Promise<void> {}
  async clearAllInputs(): Promise<void> {
    this.inputs.length = 0;
  }
}

function embeddedBatcher(adapter: SolanaSignerAdapter, storage: MemoryStorage) {
  return new Batcher({
    pollingIntervalMs: 1000,
    enableHttpServer: false,
    adapters: { solanaOperator: adapter },
    defaultTarget: "solanaOperator",
  }, storage);
}

test("Batcher.batchInput: queues an operator-signed input", async () => {
  const storage = new MemoryStorage();
  const batcher = embeddedBatcher(new SolanaSignerAdapter(config()), storage);
  const input = signed({ instructions: [memoIx()] }, "solanaOperator");
  expect(await batcher.batchInput(input, "no-wait")).toBeNull();
  expect(storage.inputs).toEqual([input]);
});

test("Batcher.batchInput: refuses a bad operator signature (401) before validation", async () => {
  const storage = new MemoryStorage();
  const batcher = embeddedBatcher(new SolanaSignerAdapter(config()), storage);
  const input = signed({ instructions: [memoIx()] }, "solanaOperator");
  const forged = {
    ...input,
    signature: bs58.encode(nacl.sign.detached(buildSolanaSignerMessage(input), stranger.secretKey)),
  };
  const error = await thrownBy(() => batcher.batchInput(forged, "no-wait"));
  expect(error).toBeInstanceOf(InputValidationError);
  expect((error as InputValidationError).statusCode).toBe(401);
  expect(storage.inputs).toHaveLength(0);
});

test("Batcher.batchInput: refuses a disallowed program (400) even when operator-signed", async () => {
  const storage = new MemoryStorage();
  const batcher = embeddedBatcher(new SolanaSignerAdapter(config()), storage);
  const drain = SystemProgram.transfer({
    fromPubkey: operator.publicKey,
    toPubkey: stranger.publicKey,
    lamports: 1,
  });
  const input = signed({ instructions: [drain] }, "solanaOperator");
  const error = await thrownBy(() => batcher.batchInput(input, "no-wait"));
  expect(error).toBeInstanceOf(InputValidationError);
  expect((error as InputValidationError).statusCode).toBe(400);
  expect(messageOf(error)).toContain("allowedProgramIds");
  expect(storage.inputs).toHaveLength(0);
});

test("BatchProcessor: each input gets its own signature; a failed send is charged a retry, the rest complete", async () => {
  const adapter = new SolanaSignerAdapter(config({ maxBatchSize: 3, receiptPollIntervalMs: 5 }));
  const s = stubbed(adapter, {
    send: (_tx, call) => {
      if (call === 1) throw new Error("Transaction simulation failed: custom program error: 0x5");
    },
  });
  // Every sent tx confirms at slot 9 + its index.
  // deno-lint-ignore no-explicit-any
  const conn = (adapter as any).connection;
  conn.getSignatureStatus = async (sig: string) => {
    const i = s.sent.findIndex((t) => bs58.encode(t.signature!) === sig);
    return {
      context: { slot: 1 },
      value: i < 0 ? null : { slot: 9 + i, confirmations: 1, err: null, confirmationStatus: "confirmed" },
    };
  };

  const inputs = ["a", "b", "c"].map((t) => signed({ instructions: [memoIx(t)] }, "solanaOperator"));
  const removed: DefaultBatcherInput[] = [];
  const charged: DefaultBatcherInput[] = [];
  const resolved = new Map<string, string>();
  const callbacks = new Map<string, {
    resolve: (r: { hash: string }) => void;
    reject: (e: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();
  for (const i of inputs) {
    callbacks.set(i.timestamp + i.input, {
      resolve: (r) => resolved.set(i.input, r.hash),
      reject: (e) => resolved.set(i.input, `rejected: ${e.message}`),
      timeoutId: setTimeout(() => {}, 0),
    });
  }
  const processor = new BatchProcessor<DefaultBatcherInput>({
    emitStateTransition: async () => {},
    storage: {
      removeProcessedInputs: async (xs) => {
        removed.push(...xs);
      },
      incrementRetryCount: async (xs) => {
        charged.push(...xs);
      },
    },
    submissionCallbacks: callbacks,
    waitForEffectStreamProcessed: async () => null,
    getCallbackKey: (i) => i.timestamp + i.input,
    getRetryPolicy: () => ({ maxRetries: 3, retryDelayMs: 10 }),
    setTargetCooldown: () => {},
  });

  await processor.processBatchForTarget(adapter, "solanaOperator", inputs, 1_000);

  expect(charged).toEqual([inputs[1]]);
  expect(removed).toEqual([inputs[0], inputs[2]]);
  const sigs = s.sent.map((t) => bs58.encode(t.signature!));
  expect(resolved.get(inputs[0].input)).toBe(sigs[0]);
  expect(resolved.get(inputs[2].input)).toBe(sigs[1]);
  expect(resolved.has(inputs[1].input)).toBe(false);
});
