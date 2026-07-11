import { test, expect } from "bun:test";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { SolanaAdapter } from "./solana-adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

// Deterministic sponsor (fee-payer) keypair so the address is knowable.
const sponsorKeypair = Keypair.fromSeed(new Uint8Array(32).fill(9));
const sponsorSecretKey = bs58.encode(sponsorKeypair.secretKey);

// The single program this batcher sponsors (a throwaway pubkey for unit tests).
const TARGET_PROGRAM_ID = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey.toBase58();

// ComputeBudget program id (what wallets inject for priority fees).
const COMPUTE_BUDGET_ID = "ComputeBudget111111111111111111111111111111";

const TEST_CONFIG = {
  rpcUrl: "http://127.0.0.1:8899",
  batcherSecretKey: sponsorSecretKey,
  targetProgramId: TARGET_PROGRAM_ID,
  syncProtocolName: "parallelSolanaRPC",
} as const;

const adapter = new SolanaAdapter(TEST_CONFIG);

// A stand-in recent-blockhash (32-byte base58); verification works without a
// live validator because we never submit in these unit tests.
const RECENT_BLOCKHASH = Keypair.generate().publicKey.toBase58();

/** Build a base64, user-partially-signed tx sponsored by `sponsor`. */
function buildSponsoredTx(opts: {
  user: Keypair;
  feePayer?: PublicKey;
  programId?: PublicKey;
  userSigns?: boolean;
}): string {
  const user = opts.user;
  const feePayer = opts.feePayer ?? sponsorKeypair.publicKey;
  const programId = opts.programId ?? new PublicKey(TARGET_PROGRAM_ID);
  const userSigns = opts.userSigns ?? true;

  const ix = new TransactionInstruction({
    keys: [{ pubkey: user.publicKey, isSigner: true, isWritable: false }],
    programId,
    data: Buffer.from("memo", "utf8"),
  });

  const tx = new Transaction();
  tx.feePayer = feePayer;
  tx.recentBlockhash = RECENT_BLOCKHASH;
  tx.add(ix);
  if (userSigns) tx.partialSign(user);
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

function inputOf(address: string, base64Tx: string): DefaultBatcherInput {
  return {
    address,
    addressType: 9, // AddressType.SOLANA
    input: base64Tx,
    signature: "",
    timestamp: Date.now().toString(),
  } as unknown as DefaultBatcherInput;
}

test("SolanaAdapter.getAccountAddress returns the real sponsor pubkey", () => {
  expect(adapter.getAccountAddress()).toBe(sponsorKeypair.publicKey.toBase58());
});

test("SolanaAdapter.validateInput accepts a sponsored tx targeting the configured program", async () => {
  const user = Keypair.generate();
  const base64 = buildSponsoredTx({ user });
  const res = await adapter.validateInput(inputOf(user.publicKey.toBase58(), base64));
  expect(res.valid).toBe(true);
});

test("SolanaAdapter.validateInput also allows a ComputeBudget instruction", async () => {
  const user = Keypair.generate();
  const tx = new Transaction();
  tx.feePayer = sponsorKeypair.publicKey;
  tx.recentBlockhash = RECENT_BLOCKHASH;
  tx.add(new TransactionInstruction({
    keys: [],
    programId: new PublicKey(COMPUTE_BUDGET_ID),
    data: Buffer.from([1, 0, 0, 0]),
  }));
  tx.add(new TransactionInstruction({
    keys: [{ pubkey: user.publicKey, isSigner: true, isWritable: false }],
    programId: new PublicKey(TARGET_PROGRAM_ID),
    data: Buffer.from("memo", "utf8"),
  }));
  tx.partialSign(user);
  const base64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
  const res = await adapter.validateInput(inputOf(user.publicKey.toBase58(), base64));
  expect(res.valid).toBe(true);
});

test("SolanaAdapter.validateInput rejects a tx that calls a non-target program", async () => {
  const user = Keypair.generate();
  const base64 = buildSponsoredTx({
    user,
    programId: SystemProgram.programId, // System transfer — out of scope
  });
  const res = await adapter.validateInput(inputOf(user.publicKey.toBase58(), base64));
  expect(res.valid).toBe(false);
});

test("SolanaAdapter.validateInput rejects a tx whose fee payer is not the sponsor", async () => {
  const user = Keypair.generate();
  const base64 = buildSponsoredTx({
    user,
    feePayer: user.publicKey, // wrong fee payer
  });
  const res = await adapter.validateInput(inputOf(user.publicKey.toBase58(), base64));
  expect(res.valid).toBe(false);
});

test("SolanaAdapter.validateInput rejects malformed input", async () => {
  const res = await adapter.validateInput(inputOf("x", "not-base64-tx"));
  expect(res.valid).toBe(false);
});

test("SolanaAdapter.validateInput rejects the sponsor appearing in instruction accounts by default", async () => {
  const user = Keypair.generate();
  const ix = new TransactionInstruction({
    // Target program, but the sponsor is also a (rent-paying) account.
    keys: [
      { pubkey: user.publicKey, isSigner: true, isWritable: false },
      { pubkey: sponsorKeypair.publicKey, isSigner: true, isWritable: true },
    ],
    programId: new PublicKey(TARGET_PROGRAM_ID),
    data: Buffer.from("rent", "utf8"),
  });
  const tx = new Transaction();
  tx.feePayer = sponsorKeypair.publicKey;
  tx.recentBlockhash = RECENT_BLOCKHASH;
  tx.add(ix);
  tx.partialSign(user);
  const base64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
  const res = await adapter.validateInput(inputOf(user.publicKey.toBase58(), base64));
  expect(res.valid).toBe(false);
});

test("SolanaAdapter.validateInput allows the sponsor in instruction accounts when opted in", async () => {
  const permissive = new SolanaAdapter({
    ...TEST_CONFIG,
    allowSponsorAsInstructionAccount: true,
  });
  const user = Keypair.generate();
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: user.publicKey, isSigner: true, isWritable: false },
      { pubkey: sponsorKeypair.publicKey, isSigner: true, isWritable: true },
    ],
    programId: new PublicKey(TARGET_PROGRAM_ID),
    data: Buffer.from("rent", "utf8"),
  });
  const tx = new Transaction();
  tx.feePayer = sponsorKeypair.publicKey;
  tx.recentBlockhash = RECENT_BLOCKHASH;
  tx.add(ix);
  tx.partialSign(user);
  const base64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
  const res = await permissive.validateInput(inputOf(user.publicKey.toBase58(), base64));
  expect(res.valid).toBe(true);
});

test("SolanaAdapter.verifySignature accepts a tx with a valid user partial signature", async () => {
  const user = Keypair.generate();
  const base64 = buildSponsoredTx({ user });
  const ok = await adapter.verifySignature(inputOf(user.publicKey.toBase58(), base64));
  expect(ok).toBe(true);
});

test("SolanaAdapter.verifySignature rejects a tx with no user signature", async () => {
  const user = Keypair.generate();
  const base64 = buildSponsoredTx({ user, userSigns: false });
  const ok = await adapter.verifySignature(inputOf(user.publicKey.toBase58(), base64));
  expect(ok).toBe(false);
});

test("SolanaAdapter.buildBatchData collects base64 transaction strings", () => {
  const user = Keypair.generate();
  const base64 = buildSponsoredTx({ user });
  const res = adapter.buildBatchData([
    inputOf(user.publicKey.toBase58(), base64),
    inputOf(user.publicKey.toBase58(), base64),
  ]);
  expect(res).not.toBeNull();
  expect(res!.data.transactions.length).toBe(2);
  expect(res!.data.transactions[0]).toBe(base64);
});

test("SolanaAdapter is always ready", () => {
  expect(adapter.isReady()).toBe(true);
});
