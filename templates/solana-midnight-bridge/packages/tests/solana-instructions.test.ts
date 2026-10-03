// Pure unit tests (no chain, no ports): instruction layouts, PDA seeds, the
// shared log parser, account decoders, deployment-file merging and the FR-009
// key guards. Fixture log lines are the exact lines the S3 spike's program
// emitted on a local validator (evidence p0/s3/stf-payloads.jsonl).
//
// Run: bun test ./solana-instructions.test.ts
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  IX_INITIALIZE_LEN,
  IX_LOCK_LEN,
  IX_RELEASE_LEN,
  LOCAL_BRIDGE_PROGRAM_ID,
} from "@solana-midnight-bridge/contracts-solana/program-id";
import {
  createInitializeInstruction,
  createLockInstruction,
  createReleaseInstruction,
  createReleaseWithAtaInstructions,
  decodeConfig,
  decodeReceipt,
  findReceiptAddress,
  findVaultAddress,
  parseBridgeLog,
  parseBridgeLogs,
  splitRecipientHex,
  u64le,
} from "@solana-midnight-bridge/contracts-solana/instructions";
import { customErrorOf, sendTx } from "@solana-midnight-bridge/contracts-solana/chain";
import {
  LOCAL_KEYS,
  assertLocalRpc,
  checkLiveDeployKeys,
  extraLocalRpcHosts,
  isLocalRpcUrl,
  isLoopbackRpcUrl,
  readKeypairFile,
  redactRpcUrl,
  writeKeypairFile,
} from "@solana-midnight-bridge/contracts-solana/keys";
import { readDeployment, writeDeploymentSection } from "@solana-midnight-bridge/contracts-solana/deployments";

const programId = new PublicKey(LOCAL_BRIDGE_PROGRAM_ID);
const mint = new PublicKey("H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w");
const a = Keypair.generate().publicKey;
const b = Keypair.generate().publicKey;

// Lines emitted by the bridge program in spike S3 (public keys only).
const INIT_LINE =
  "Program log: EFFECTSTREAM_BRIDGE|INIT|2k1MXvXa79KMcYkbQUzkpnJHYHRPv6m8wg2CEa3KEWnY|H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w|2RsoEyeG88zEndU8YF1k6NCuLxCXfpAf6Xs5TaoGqMyb";
const LOCK_HEX =
  "c8f7aaf31ded7e4fdc0e3822de68abf8847ae57c627b0d2358ca578759667fe95e06441e8b0d0ef969d0544cd7af9b5ef68bc55c5212c64490ddc0ba5b8fc4fb";
const LOCK_LINE = `Program log: EFFECTSTREAM_BRIDGE|LOCK|0|2iwbSktGBUzAPK6KPMjUtsHkuZNAJTY1Rve9ZaF21qu6|H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w|10000000|${LOCK_HEX}`;
const RELEASE_LINE =
  "Program log: EFFECTSTREAM_BRIDGE|RELEASE|0|5Bu7NHWFFj9wvySUnk1m7xSFsWL7iquZQswcQ5bkxUmg|4000000";

describe("instruction layouts (must match programs/bridge/src/lib.rs)", () => {
  test("Initialize: tag 0 ‖ operator, 33 B, 7 accounts, payer signs", () => {
    const ix = createInitializeInstruction({ programId, payer: a, mint, operator: b });
    expect(ix.data.length).toBe(IX_INITIALIZE_LEN);
    expect(ix.data[0]).toBe(0);
    expect(Buffer.from(ix.data.subarray(1)).equals(b.toBuffer())).toBe(true);
    expect(ix.keys.length).toBe(7);
    expect(ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())).toEqual([a.toBase58()]);
    expect(ix.keys[3]!.pubkey.equals(findVaultAddress(programId, mint)[0])).toBe(true);
    expect(ix.keys[5]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(ix.keys[6]!.pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  test("Lock: tag 1 ‖ amount u64 LE ‖ recipient[64], 73 B", () => {
    const recipient = Buffer.from(LOCK_HEX, "hex");
    const ix = createLockInstruction({ programId, depositor: a, source: b, mint, amount: 10_000_000n, midnightRecipient: recipient });
    expect(ix.data.length).toBe(IX_LOCK_LEN);
    expect(ix.data[0]).toBe(1);
    expect(Buffer.from(ix.data).readBigUInt64LE(1)).toBe(10_000_000n);
    expect(Buffer.from(ix.data.subarray(9)).toString("hex")).toBe(LOCK_HEX);
    expect(ix.keys.map((k) => [k.isSigner, k.isWritable])).toEqual([
      [true, false], [false, true], [false, true], [false, true], [false, false],
    ]);
  });

  test("Lock refuses a recipient that is not 64 bytes, and amounts outside u64", () => {
    expect(() => createLockInstruction({ programId, depositor: a, source: b, mint, amount: 1n, midnightRecipient: new Uint8Array(63) })).toThrow(RangeError);
    expect(() => createLockInstruction({ programId, depositor: a, source: b, mint, amount: 1n << 64n, midnightRecipient: new Uint8Array(64) })).toThrow(RangeError);
    expect(() => createLockInstruction({ programId, depositor: a, source: b, mint, amount: -1n, midnightRecipient: new Uint8Array(64) })).toThrow(RangeError);
  });

  test("Release: tag 2 ‖ id u64 ‖ amount u64, 17 B; operator and payer sign", () => {
    const ix = createReleaseInstruction({ programId, operator: a, payer: b, mint, destination: a, withdrawalId: 7n, amount: 4_000_000n });
    expect(ix.data.length).toBe(IX_RELEASE_LEN);
    expect(ix.data[0]).toBe(2);
    expect(Buffer.from(ix.data).readBigUInt64LE(1)).toBe(7n);
    expect(Buffer.from(ix.data).readBigUInt64LE(9)).toBe(4_000_000n);
    expect(ix.keys.length).toBe(9);
    expect(ix.keys.slice(0, 2).map((k) => [k.pubkey.toBase58(), k.isSigner])).toEqual([[a.toBase58(), true], [b.toBase58(), true]]);
    expect(ix.keys[6]!.pubkey.equals(findReceiptAddress(programId, 7n)[0])).toBe(true);
  });

  test("the relayer's release is [ATA idempotent create, Release] into the recipient's ATA", () => {
    const { destination, instructions } = createReleaseWithAtaInstructions({
      programId, operator: a, payer: a, mint, recipientOwner: b, withdrawalId: 3n, amount: 1n,
    });
    expect(destination.equals(getAssociatedTokenAddressSync(mint, b, true))).toBe(true);
    expect(instructions.length).toBe(2);
    expect(instructions[0]!.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(instructions[0]!.data.equals(Buffer.from([1]))).toBe(true); // CreateIdempotent
    expect(instructions[1]!.programId.equals(programId)).toBe(true);
    expect(instructions[1]!.keys[5]!.pubkey.equals(destination)).toBe(true);
  });
});

describe("PDAs", () => {
  test("receipt seed is the withdrawal id as u64 little-endian", () => {
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from("release"), Buffer.from([5, 0, 0, 0, 0, 0, 0, 0])], programId);
    expect(findReceiptAddress(programId, 5n)[0].equals(expected)).toBe(true);
    expect(findReceiptAddress(programId, 5n)[0].equals(findReceiptAddress(programId, 6n)[0])).toBe(false);
    expect(u64le(0x0102n).toString("hex")).toBe("0201000000000000");
  });

  test("vault depends on the mint and the program id", () => {
    expect(findVaultAddress(programId, mint)[0].equals(findVaultAddress(programId, a)[0])).toBe(false);
    expect(findVaultAddress(programId, mint)[0].equals(findVaultAddress(b, mint)[0])).toBe(false);
  });
});

describe("parseBridgeLog (shared with the state machine)", () => {
  test("parses the program's INIT, LOCK and RELEASE lines", () => {
    expect(parseBridgeLog(INIT_LINE)).toEqual({
      kind: "INIT",
      operator: "2k1MXvXa79KMcYkbQUzkpnJHYHRPv6m8wg2CEa3KEWnY",
      mint: "H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w",
      vault: "2RsoEyeG88zEndU8YF1k6NCuLxCXfpAf6Xs5TaoGqMyb",
    });
    expect(parseBridgeLog(LOCK_LINE)).toEqual({
      kind: "LOCK",
      nonce: 0n,
      depositor: "2iwbSktGBUzAPK6KPMjUtsHkuZNAJTY1Rve9ZaF21qu6",
      mint: "H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w",
      amount: 10_000_000n,
      recipientHex: LOCK_HEX,
    });
    expect(parseBridgeLog(RELEASE_LINE)).toEqual({
      kind: "RELEASE",
      withdrawalId: 0n,
      recipientOwner: "5Bu7NHWFFj9wvySUnk1m7xSFsWL7iquZQswcQ5bkxUmg",
      amount: 4_000_000n,
    });
  });

  test("accepts the line without the `Program log: ` prefix", () => {
    expect(parseBridgeLog(RELEASE_LINE.slice("Program log: ".length))).toEqual(parseBridgeLog(RELEASE_LINE));
  });

  test("accepts u64 max, refuses 2^64 and leading zeros", () => {
    const max = "18446744073709551615";
    expect(parseBridgeLog(`EFFECTSTREAM_BRIDGE|RELEASE|${max}|5Bu7NHWFFj9wvySUnk1m7xSFsWL7iquZQswcQ5bkxUmg|1`)).toMatchObject({ withdrawalId: 2n ** 64n - 1n });
    expect(parseBridgeLog(`EFFECTSTREAM_BRIDGE|RELEASE|18446744073709551616|5Bu7NHWFFj9wvySUnk1m7xSFsWL7iquZQswcQ5bkxUmg|1`)).toBeNull();
    expect(parseBridgeLog(`EFFECTSTREAM_BRIDGE|RELEASE|01|5Bu7NHWFFj9wvySUnk1m7xSFsWL7iquZQswcQ5bkxUmg|1`)).toBeNull();
  });

  test("refuses malformed or foreign lines", () => {
    const bad = [
      "Program log: something else",
      "Program 2bqN4ePY9kHSyHkSxhc8WTdRDfpk9BGThCAqGoh6cagf invoke [1]",
      LOCK_LINE.replace(LOCK_HEX, LOCK_HEX.toUpperCase()),
      LOCK_LINE.replace(LOCK_HEX, LOCK_HEX.slice(2)),
      LOCK_LINE + "|extra",
      LOCK_LINE.replace("|LOCK|0|", "|LOCK|-1|"),
      LOCK_LINE.replace("2iwbSktGBUzAPK6KPMjUtsHkuZNAJTY1Rve9ZaF21qu6", "0OIl"),
      RELEASE_LINE.replace("|RELEASE|", "|REFUND|"),
      RELEASE_LINE.replace("EFFECTSTREAM_BRIDGE", "EFFECTSTREAM_BRIDGEX"),
      INIT_LINE.split("|").slice(0, 4).join("|"),
    ];
    for (const line of bad) expect(parseBridgeLog(line)).toBeNull();
  });

  test("parseBridgeLogs returns every bridge line of a transaction, in order", () => {
    const lock2 = LOCK_LINE.replace("|LOCK|0|", "|LOCK|1|");
    const logs = [
      "Program 2bqN4ePY9kHSyHkSxhc8WTdRDfpk9BGThCAqGoh6cagf invoke [1]",
      LOCK_LINE,
      "Program log: Instruction: Transfer",
      lock2,
      "Program 2bqN4ePY9kHSyHkSxhc8WTdRDfpk9BGThCAqGoh6cagf success",
    ];
    expect(parseBridgeLogs(logs).map((l) => (l.kind === "LOCK" ? l.nonce : -1n))).toEqual([0n, 1n]);
  });

  test("splitRecipientHex yields coin public key ‖ encryption public key", () => {
    const { coinPublicKey, encryptionPublicKey } = splitRecipientHex(LOCK_HEX);
    expect(Buffer.from(coinPublicKey).toString("hex")).toBe(LOCK_HEX.slice(0, 64));
    expect(Buffer.from(encryptionPublicKey).toString("hex")).toBe(LOCK_HEX.slice(64));
    expect(() => splitRecipientHex(LOCK_HEX.slice(1))).toThrow(RangeError);
  });
});

describe("account decoders and error helpers", () => {
  test("decodeConfig / decodeReceipt read the program's layouts", () => {
    const cfg = Buffer.alloc(76);
    cfg[0] = 1; cfg[1] = 254; cfg[2] = 253; cfg[3] = 252;
    a.toBuffer().copy(cfg, 4);
    mint.toBuffer().copy(cfg, 36);
    cfg.writeBigUInt64LE(42n, 68);
    expect(decodeConfig(cfg)).toEqual({ version: 1, configBump: 254, authorityBump: 253, vaultBump: 252, operator: a.toBase58(), mint: mint.toBase58(), lockNonce: 42n });
    expect(() => decodeConfig(Buffer.alloc(76))).toThrow();

    const r = Buffer.alloc(49);
    r[0] = 1;
    r.writeBigUInt64LE(9n, 1);
    b.toBuffer().copy(r, 9);
    r.writeBigUInt64LE(4_000_000n, 41);
    expect(decodeReceipt(r)).toEqual({ version: 1, withdrawalId: 9n, recipientOwner: b.toBase58(), amount: 4_000_000n });
  });

  test("customErrorOf extracts { index, code } from meta.err", () => {
    expect(customErrorOf({ InstructionError: [1, { Custom: 6 }] })).toEqual({ index: 1, code: 6 });
    expect(customErrorOf({ InstructionError: [0, "InvalidAccountData"] })).toBeNull();
    expect(customErrorOf(null)).toBeNull();
  });
});

describe("FR-009: local keys stay local, live keys stay out of the repo", () => {
  test("loopback classification", () => {
    for (const u of ["http://localhost:8899", "http://127.0.0.1:8899", "http://127.1.2.3:1", "http://[::1]:8899"]) {
      expect(isLoopbackRpcUrl(u)).toBe(true);
    }
    for (const u of ["https://api.devnet.solana.com", "http://validator:8899", "http://10.0.0.2:8899", "http://0.0.0.0:8899"]) {
      expect(isLoopbackRpcUrl(u)).toBe(false);
    }
  });

  test("BRIDGE_LOCAL_RPC_HOSTS allows only single-label or private hosts", () => {
    expect(isLocalRpcUrl("http://validator:8899", { BRIDGE_LOCAL_RPC_HOSTS: "validator" })).toBe(true);
    expect(isLocalRpcUrl("http://10.0.0.2:8899", { BRIDGE_LOCAL_RPC_HOSTS: "10.0.0.2" })).toBe(true);
    expect(isLocalRpcUrl("http://validator:8899", {})).toBe(false);
    expect(() => extraLocalRpcHosts({ BRIDGE_LOCAL_RPC_HOSTS: "api.devnet.solana.com" })).toThrow();
    expect(() => extraLocalRpcHosts({ BRIDGE_LOCAL_RPC_HOSTS: "8.8.8.8" })).toThrow();
  });

  test("assertLocalRpc refuses devnet for local dev keys", () => {
    expect(() => assertLocalRpc("https://api.devnet.solana.com", "init-local", {})).toThrow(/FR-009/);
    expect(() => assertLocalRpc("http://127.0.0.1:8899", "init-local", {})).not.toThrow();
  });

  test("redactRpcUrl keeps protocol and host only", () => {
    expect(redactRpcUrl("https://devnet.helius-rpc.com/?api-key=SECRET")).toBe("https://devnet.helius-rpc.com");
    expect(redactRpcUrl("https://x.solana-devnet.quiknode.pro/SECRET/")).toBe("https://x.solana-devnet.quiknode.pro");
    expect(redactRpcUrl("https://user:pw@rpc.example:8899/p")).toBe("https://rpc.example:8899");
  });

  test("deploy-devnet's key checks", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-keys-"));
    try {
      const op = { file: path.join(outside, "solana-operator.json"), publicKey: Keypair.generate().publicKey };
      const prog = { file: path.join(outside, "solana-bridge-program.json"), publicKey: Keypair.generate().publicKey };
      const committed = { file: LOCAL_KEYS.program, publicKey: programId };
      const devnet = "https://api.devnet.solana.com";
      // Fresh keys outside the template: accepted.
      expect(() => checkLiveDeployKeys({ rpcUrl: devnet, operator: op, program: prog })).not.toThrow();
      // The committed local program key: refused everywhere, loopback included.
      expect(() => checkLiveDeployKeys({ rpcUrl: devnet, operator: op, program: committed })).toThrow(/committed local program key/);
      expect(() => checkLiveDeployKeys({ rpcUrl: "http://127.0.0.1:8899", operator: op, program: committed })).toThrow(/committed local program key/);
      // A key file inside the template (e.g. the gitignored local operator) on devnet: refused.
      const localOp = { file: LOCAL_KEYS.operator, publicKey: Keypair.generate().publicKey };
      expect(() => checkLiveDeployKeys({ rpcUrl: devnet, operator: localOp, program: prog })).toThrow(/FR-009/);
      // ... but tolerated on loopback (deploy-script tests against a local validator).
      expect(() => checkLiveDeployKeys({ rpcUrl: "http://127.0.0.1:8899", operator: localOp, program: prog })).not.toThrow();
      // Operator and program must differ.
      expect(() => checkLiveDeployKeys({ rpcUrl: devnet, operator: op, program: { ...prog, publicKey: op.publicKey } })).toThrow(/differ/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test("keypair files are written 600 and never overwritten", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-kp-"));
    try {
      const file = path.join(dir, "k.json");
      const kp = Keypair.generate();
      writeKeypairFile(file, kp);
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(readKeypairFile(file).publicKey.equals(kp.publicKey)).toBe(true);
      expect(() => writeKeypairFile(file, Keypair.generate())).toThrow();
      fs.writeFileSync(path.join(dir, "bad.json"), JSON.stringify([1, 2, 3]));
      expect(() => readKeypairFile(path.join(dir, "bad.json"))).toThrow(/64-byte/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the committed program keypair matches LOCAL_BRIDGE_PROGRAM_ID", () => {
    expect(readKeypairFile(LOCAL_KEYS.program).publicKey.toBase58()).toBe(LOCAL_BRIDGE_PROGRAM_ID);
  });
});

describe("deployment files", () => {
  test("each script merges only its own section", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-deploy-"));
    try {
      const file = path.join(dir, "x.json");
      writeDeploymentSection(file, "midnight", { contract: "abc" });
      writeDeploymentSection(file, "solana", { programId: "p" });
      writeDeploymentSection(file, "solana", { programId: "q" });
      expect(readDeployment(file)).toEqual({ midnight: { contract: "abc" }, solana: { programId: "q" } } as never);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// T6 F-T6.5: with skipPreflight a failing transaction lands on chain, and
// sendTx must return its error (the tests assert on-chain refusals that way).
// web3.js' confirmTransaction, however, REJECTS with the bare TransactionError
// object when its signature-status poll sees the failure before the
// signature-notification does (a race; @solana/web3.js 1.99 index.cjs.js:6797).
// The e2e's non-operator release hit it: a correct refusal, thrown instead of
// returned.
describe("sendTx returns a landed failure (F-T6.5)", () => {
  const payer = Keypair.generate();
  const ix = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 });
  const landedErr = { InstructionError: [1, { Custom: 5 }] };
  function fakeConnection(confirm: () => Promise<unknown>) {
    return {
      getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
      sendRawTransaction: async () => "sig1111",
      confirmTransaction: confirm,
      getTransaction: async () => ({ slot: 42, meta: { err: landedErr, logMessages: ["Program log: refused"] } }),
    } as any;
  }

  test("when confirmTransaction rejects with the transaction's own error", async () => {
    const sent = await sendTx(fakeConnection(() => Promise.reject(landedErr)), [ix], [payer], { skipPreflight: true });
    expect(sent).toEqual({ signature: "sig1111", slot: 42, err: landedErr, logs: ["Program log: refused"] });
    expect(customErrorOf(sent.err)).toEqual({ index: 1, code: 5 });
  });

  test("when confirmTransaction resolves with it (the notification won the race)", async () => {
    const sent = await sendTx(fakeConnection(async () => ({ context: { slot: 42 }, value: { err: landedErr } })), [ix], [payer], { skipPreflight: true });
    expect(customErrorOf(sent.err)).toEqual({ index: 1, code: 5 });
  });

  test("a real failure to confirm (an Error) still throws", async () => {
    const boom = new Error("block height exceeded");
    await expect(sendTx(fakeConnection(() => Promise.reject(boom)), [ix], [payer], { skipPreflight: true })).rejects.toThrow("block height exceeded");
  });
});

