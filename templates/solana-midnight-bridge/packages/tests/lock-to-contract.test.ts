// Pure unit tests (no chain, no ports) for `LockToContract` (plan 00058 Interfaces I-2): the
// instruction bytes, the LOCKC log line, and the lock-nonce read, against the frozen vectors in
// fixtures/00058-interfaces.json. The 00050 wallet `Lock` golden vector must still hold.
//
// Run: bun test ./lock-to-contract.test.ts
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  BridgeError,
  IX_LOCK_LEN,
  IX_LOCK_TO_CONTRACT,
  IX_LOCK_TO_CONTRACT_LEN,
  LOCAL_BRIDGE_PROGRAM_ID,
  MIDNIGHT_CONTRACT_LEN,
} from "@solana-midnight-bridge/contracts-solana/program-id";
import {
  createLockInstruction,
  createLockToContractInstruction,
  fetchLockNonces,
  findConfigAddress,
  findVaultAddress,
  lockNoncesFromLogs,
  parseBridgeLog,
  parseBridgeLogs,
} from "@solana-midnight-bridge/contracts-solana/instructions";

type Fixture = {
  i2: {
    tag: number;
    dataLength: number;
    accounts: Array<{ index: number; signer: boolean; writable: boolean }>;
    errors: Record<string, number>;
    logRegex: string;
    instructions: Array<{ name: string; data: string; valid: boolean; amount?: string; contractHex?: string; error?: string; customError?: number }>;
    logLines: Array<{ name: string; line: string; valid: boolean; parsed?: Record<string, string> }>;
    mixedTransaction: { logMessages: string[]; lockNonces: Array<{ kind: string; nonce: string }>; transferIds: string[] };
    walletLockGolden: { data: string; dataLength: number; logLine: string };
  };
};
const fx = JSON.parse(fs.readFileSync(path.join(import.meta.dirname!, "fixtures/00058-interfaces.json"), "utf8")) as Fixture;

const programId = new PublicKey(LOCAL_BRIDGE_PROGRAM_ID);
const mint = new PublicKey("H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w");
const depositor = Keypair.generate().publicKey;
const source = Keypair.generate().publicKey;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("LockToContract instruction (I-2)", () => {
  test("constants match the frozen interface", () => {
    expect(IX_LOCK_TO_CONTRACT).toBe(fx.i2.tag);
    expect(IX_LOCK_TO_CONTRACT_LEN).toBe(fx.i2.dataLength);
    expect(MIDNIGHT_CONTRACT_LEN).toBe(32);
    expect(BridgeError.InvalidInstruction).toBe(fx.i2.errors.InvalidInstruction!);
    expect(BridgeError.ZeroAmount).toBe(fx.i2.errors.ZeroAmount!);
    expect(BridgeError.InvalidRecipient).toBe(fx.i2.errors.InvalidRecipient!);
  });

  test("the valid vector encodes byte for byte, with Lock's accounts in Lock's order", () => {
    const v = fx.i2.instructions.find((x) => x.valid)!;
    const ix = createLockToContractInstruction({
      programId, depositor, source, mint, amount: BigInt(v.amount!), contract: Buffer.from(v.contractHex!, "hex"),
    });
    expect(hex(ix.data)).toBe(v.data);
    expect(ix.data.length).toBe(41);
    expect(ix.programId.equals(programId)).toBe(true);
    expect(ix.keys.map((k) => [k.isSigner, k.isWritable])).toEqual(fx.i2.accounts.map((a) => [a.signer, a.writable]));
    expect(ix.keys[0]!.pubkey.equals(depositor)).toBe(true);
    expect(ix.keys[1]!.pubkey.equals(source)).toBe(true);
    expect(ix.keys[2]!.pubkey.equals(findConfigAddress(programId)[0])).toBe(true);
    expect(ix.keys[3]!.pubkey.equals(findVaultAddress(programId, mint)[0])).toBe(true);
    expect(ix.keys[4]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    // The same accounts as a wallet Lock for the same depositor/source/mint.
    const lock = createLockInstruction({ programId, depositor, source, mint, amount: 1n, midnightRecipient: new Uint8Array(64).fill(1) });
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual(lock.keys.map((k) => k.pubkey.toBase58()));
  });

  test("the builder refuses what the program refuses up front: a contract of another length, an all-zero contract, a non-u64 amount", () => {
    for (const len of [0, 31, 33, 64]) {
      expect(() => createLockToContractInstruction({ programId, depositor, source, mint, amount: 1n, contract: new Uint8Array(len).fill(0xa1) })).toThrow(RangeError);
    }
    expect(() => createLockToContractInstruction({ programId, depositor, source, mint, amount: 1n, contract: new Uint8Array(32) })).toThrow(/all-zero/);
    expect(() => createLockToContractInstruction({ programId, depositor, source, mint, amount: 1n << 64n, contract: new Uint8Array(32).fill(1) })).toThrow(RangeError);
    expect(() => createLockToContractInstruction({ programId, depositor, source, mint, amount: -1n, contract: new Uint8Array(32).fill(1) })).toThrow(RangeError);
  });

  test("the refused vectors decode to the documented reasons (lengths 40/42, zero contract, zero amount)", () => {
    for (const v of fx.i2.instructions.filter((x) => !x.valid)) {
      const d = Buffer.from(v.data, "hex");
      expect(d[0]).toBe(IX_LOCK_TO_CONTRACT);
      if (v.error === "InvalidInstruction") expect(d.length).not.toBe(41);
      if (v.error === "InvalidRecipient") expect([...d.subarray(9)].every((b) => b === 0)).toBe(true);
      if (v.error === "ZeroAmount") expect(d.readBigUInt64LE(1)).toBe(0n);
      expect(v.customError).toBe(BridgeError[v.error as keyof typeof BridgeError]);
    }
  });

  test("the 00050 wallet Lock golden vector is unchanged (tag 1, 73 bytes)", () => {
    const g = fx.i2.walletLockGolden;
    const d = Buffer.from(g.data, "hex");
    expect(d.length).toBe(IX_LOCK_LEN);
    const ix = createLockInstruction({ programId, depositor, source, mint, amount: d.readBigUInt64LE(1), midnightRecipient: d.subarray(9) });
    expect(hex(ix.data)).toBe(g.data);
  });
});

describe("LOCKC log line (I-2)", () => {
  test("valid lines parse to the documented fields, with and without the prefix", () => {
    for (const v of fx.i2.logLines.filter((x) => x.valid)) {
      const p = parseBridgeLog(v.line);
      expect(p).not.toBeNull();
      expect(p!.kind).toBe("LOCKC");
      if (p!.kind !== "LOCKC") continue;
      expect({ kind: p.kind, nonce: String(p.nonce), depositor: p.depositor, mint: p.mint, amount: String(p.amount), contractHex: p.contractHex }).toEqual(v.parsed as never);
      expect(new RegExp(fx.i2.logRegex).test(v.line)).toBe(true);
    }
  });

  test("malformed lines are refused (null): 63/65 hex, upper case, 6/8 fields, nonce or amount > u64, leading zero, non-base58", () => {
    for (const v of fx.i2.logLines.filter((x) => !x.valid)) {
      expect(parseBridgeLog(v.line)).toBeNull();
    }
  });

  test("a LOCK line is never a LOCKC line, and the wallet LOCK line still parses as before", () => {
    const p = parseBridgeLog(fx.i2.walletLockGolden.logLine);
    expect(p?.kind).toBe("LOCK");
  });

  test("lockNoncesFromLogs: a mixed LOCK, LOCKC, LOCK transaction gives three nonces in order", () => {
    const got = lockNoncesFromLogs(fx.i2.mixedTransaction.logMessages);
    expect(got.map((x) => ({ kind: x.kind, nonce: String(x.nonce) }))).toEqual(fx.i2.mixedTransaction.lockNonces);
    expect(got.map((x) => `s2m:${x.nonce}`)).toEqual(fx.i2.mixedTransaction.transferIds);
    // parseBridgeLogs keeps every kind; lockNoncesFromLogs only the locks.
    expect(parseBridgeLogs(fx.i2.mixedTransaction.logMessages).map((l) => l.kind)).toEqual(["LOCK", "LOCKC", "LOCK"]);
  });

  test("fetchLockNonces reads a confirmed transaction's logs and refuses a missing or failed one", async () => {
    const calls: unknown[] = [];
    const conn = {
      getTransaction: async (sig: string, opts: unknown) => {
        calls.push([sig, opts]);
        if (sig === "missing") return null;
        if (sig === "failed") return { meta: { err: { InstructionError: [0, { Custom: 10 }] }, logMessages: [] } };
        return { meta: { err: null, logMessages: fx.i2.mixedTransaction.logMessages } };
      },
    } as never;
    expect((await fetchLockNonces(conn, "ok")).map((x) => `${x.kind}:${x.nonce}`)).toEqual(["LOCK:3", "LOCKC:4", "LOCK:5"]);
    expect(calls[0]).toEqual(["ok", { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
    await expect(fetchLockNonces(conn, "missing")).rejects.toThrow(/not found/);
    await expect(fetchLockNonces(conn, "failed")).rejects.toThrow(/failed/);
  });
});
