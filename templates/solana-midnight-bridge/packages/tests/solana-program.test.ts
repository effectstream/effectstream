// T-P1 (sub-plan T1 tests): the bridge program on a local validator.
//   - a lock emits the exact LOCK log line and the vault balance rises;
//   - a release by a non-operator is refused (Unauthorized, on chain);
//   - a second release for the same id is refused (AlreadyReleased, on chain);
//   - zero amounts are refused (ZeroAmount) for both Lock and Release;
//   - plus: a valid release pays the recipient's ATA created in the same tx,
//     and a second Initialize is refused (AlreadyInitialized).
//
// Validator: with SOLANA_RPC_URL set, the tests use that (already running,
// e.g. the orchestrator's; init-local's state is reused). Otherwise they start
// a throwaway validator on random ports >= 10000 and stop it afterwards.
//
// Shared-validator hygiene: withdrawal ids are drawn from [2^62, 2^62 + 2^32),
// far above the Midnight contract's withdrawal counter, so these releases can
// never collide with a real bridge withdrawal; the deployment record goes to a
// temp file, never deployments/local.json. The test's own lock/release still
// moves the vault (+6 tokens net), so an end-to-end suite on the same validator
// must compare balances as deltas.
//
// Refusals are sent with skipPreflight, so each one lands ON CHAIN as a failed
// transaction and the test asserts the program's custom error code.
//
// 00058 adds `LockToContract` (tag 3, plan Interfaces I-2): (a) a lock to a
// contract and its LOCKC line, (b) one nonce counter shared with Lock, (c) a zero
// amount, (d) an all-zero contract, (e) 40/42-byte data, (f) an unsigned
// depositor, (g) a source of another mint; (h) tag 3 against the 00050
// program is solana-program-00050.test.ts.
//
// Run: bun test ./solana-program.test.ts   (needs build/bridge.so; Docker for CI)
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createMint, createMintToInstruction, getAccount } from "@solana/spl-token";
import {
  BridgeError,
  LOCAL_BRIDGE_PROGRAM_ID,
  TEST_MINT_DECIMALS,
} from "@solana-midnight-bridge/contracts-solana/program-id";
import {
  createAtaIdempotentPrelude,
  createInitializeInstruction,
  createLockInstruction,
  createLockToContractInstruction,
  createReleaseWithAtaInstructions,
  findReceiptAddress,
  findVaultAddress,
  lockNoncesFromLogs,
  parseBridgeLogs,
} from "@solana-midnight-bridge/contracts-solana/instructions";
import { IX_LOCK_TO_CONTRACT } from "@solana-midnight-bridge/contracts-solana/program-id";
import {
  airdropAtLeast,
  customErrorOf,
  fetchBridgeConfig,
  fetchReceipt,
  sendTx,
} from "@solana-midnight-bridge/contracts-solana/chain";
import { initLocal } from "@solana-midnight-bridge/contracts-solana/init-local";
import { startTestValidator, type TestValidator } from "./helpers/validator.ts";

const UNIT = 10n ** BigInt(TEST_MINT_DECIMALS);
const LOCK_AMOUNT = 10n * UNIT;
const RELEASE_AMOUNT = 4n * UNIT;
const TX_TIMEOUT = 120_000;

const programId = new PublicKey(LOCAL_BRIDGE_PROGRAM_ID);
let validator: TestValidator | null = null;
let conn: Connection;
let operator: Keypair;
let mint: PublicKey;
let vault: PublicKey;
let tmpDir: string;

const depositor = Keypair.generate();
const recipientOwner = Keypair.generate();
const attacker = Keypair.generate();
let depositorAta: PublicKey;

/** A withdrawal id no real Midnight withdrawal will reach. */
function testWithdrawalId(): bigint {
  return (1n << 62n) + BigInt(randomBytes(4).readUInt32LE(0));
}

async function balance(account: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, account, "confirmed")).amount;
  } catch {
    return 0n;
  }
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-program-test-deploy-"));
  let rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    validator = await startTestValidator();
    rpcUrl = validator.rpcUrl;
  }
  conn = new Connection(rpcUrl, "confirmed");
  const init = await initLocal({
    rpcUrl,
    deployment: path.join(tmpDir, "program-test.json"),
    log: (l) => console.log(`  [init-local] ${l}`),
  });
  operator = init.operator;
  mint = new PublicKey(init.deployment.mint);
  vault = new PublicKey(init.deployment.vault);

  await airdropAtLeast(conn, depositor.publicKey, 2);
  await airdropAtLeast(conn, attacker.publicKey, 2);
  const prelude = createAtaIdempotentPrelude({ payer: operator.publicKey, owner: depositor.publicKey, mint });
  depositorAta = prelude.ata;
  await sendTx(
    conn,
    [prelude.instruction, createMintToInstruction(mint, depositorAta, operator.publicKey, 100n * UNIT)],
    [operator],
  );
}, 600_000);

afterAll(() => {
  validator?.stop();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("bridge program on a local validator", () => {
  test("the program is loaded and initialized with the local operator", async () => {
    const program = await conn.getAccountInfo(programId, "confirmed");
    expect(program?.executable).toBe(true);
    const config = await fetchBridgeConfig(conn, programId);
    expect(config?.operator).toBe(operator.publicKey.toBase58());
    expect(config?.mint).toBe(mint.toBase58());
    expect(vault.equals(findVaultAddress(programId, mint)[0])).toBe(true);
  }, TX_TIMEOUT);

  test("a second Initialize is refused (AlreadyInitialized)", async () => {
    const sent = await sendTx(
      conn,
      [createInitializeInstruction({ programId, payer: attacker.publicKey, mint, operator: attacker.publicKey })],
      [attacker],
      { skipPreflight: true },
    );
    expect(customErrorOf(sent.err)).toEqual({ index: 0, code: BridgeError.AlreadyInitialized });
    expect((await fetchBridgeConfig(conn, programId))?.operator).toBe(operator.publicKey.toBase58());
  }, TX_TIMEOUT);

  test("a lock emits the exact LOCK log and the vault balance rises", async () => {
    const nonce = (await fetchBridgeConfig(conn, programId))!.lockNonce;
    const vaultBefore = await balance(vault);
    const depositorBefore = await balance(depositorAta);
    const midnightRecipient = randomBytes(64);
    const recipientHex = midnightRecipient.toString("hex");

    const sent = await sendTx(
      conn,
      [createLockInstruction({ programId, depositor: depositor.publicKey, source: depositorAta, mint, amount: LOCK_AMOUNT, midnightRecipient })],
      [depositor],
    );
    expect(sent.err).toBeNull();
    const expected = `EFFECTSTREAM_BRIDGE|LOCK|${nonce}|${depositor.publicKey.toBase58()}|${mint.toBase58()}|${LOCK_AMOUNT}|${recipientHex}`;
    expect(sent.logs).toContain(`Program log: ${expected}`);
    expect(parseBridgeLogs(sent.logs)).toEqual([
      { kind: "LOCK", nonce, depositor: depositor.publicKey.toBase58(), mint: mint.toBase58(), amount: LOCK_AMOUNT, recipientHex },
    ]);
    expect(await balance(vault)).toBe(vaultBefore + LOCK_AMOUNT);
    expect(await balance(depositorAta)).toBe(depositorBefore - LOCK_AMOUNT);
    expect((await fetchBridgeConfig(conn, programId))!.lockNonce).toBe(nonce + 1n);
  }, TX_TIMEOUT);

  test("a lock of zero is refused on chain (ZeroAmount)", async () => {
    const nonce = (await fetchBridgeConfig(conn, programId))!.lockNonce;
    const vaultBefore = await balance(vault);
    const sent = await sendTx(
      conn,
      [createLockInstruction({ programId, depositor: depositor.publicKey, source: depositorAta, mint, amount: 0n, midnightRecipient: randomBytes(64) })],
      [depositor],
      { skipPreflight: true },
    );
    expect(customErrorOf(sent.err)).toEqual({ index: 0, code: BridgeError.ZeroAmount });
    expect(await balance(vault)).toBe(vaultBefore);
    expect((await fetchBridgeConfig(conn, programId))!.lockNonce).toBe(nonce);
  }, TX_TIMEOUT);

  const releasedId = testWithdrawalId();

  test("an operator release pays the recipient's new ATA and writes the receipt", async () => {
    const vaultBefore = await balance(vault);
    const { destination, instructions } = createReleaseWithAtaInstructions({
      programId,
      operator: operator.publicKey,
      payer: operator.publicKey,
      mint,
      recipientOwner: recipientOwner.publicKey,
      withdrawalId: releasedId,
      amount: RELEASE_AMOUNT,
    });
    expect(await conn.getAccountInfo(destination, "confirmed")).toBeNull();
    expect(await fetchReceipt(conn, programId, releasedId)).toBeNull();

    const sent = await sendTx(conn, instructions, [operator]);
    expect(sent.err).toBeNull();
    const expected = `EFFECTSTREAM_BRIDGE|RELEASE|${releasedId}|${recipientOwner.publicKey.toBase58()}|${RELEASE_AMOUNT}`;
    expect(sent.logs).toContain(`Program log: ${expected}`);
    expect(parseBridgeLogs(sent.logs)).toEqual([
      { kind: "RELEASE", withdrawalId: releasedId, recipientOwner: recipientOwner.publicKey.toBase58(), amount: RELEASE_AMOUNT },
    ]);
    expect(await balance(destination)).toBe(RELEASE_AMOUNT);
    expect(await balance(vault)).toBe(vaultBefore - RELEASE_AMOUNT);
    const receipt = await fetchReceipt(conn, programId, releasedId);
    expect(receipt).toEqual({
      version: 1,
      withdrawalId: releasedId,
      recipientOwner: recipientOwner.publicKey.toBase58(),
      amount: RELEASE_AMOUNT,
    });
  }, TX_TIMEOUT);

  test("a release by a non-operator is refused on chain (Unauthorized)", async () => {
    const id = testWithdrawalId();
    const vaultBefore = await balance(vault);
    const { instructions } = createReleaseWithAtaInstructions({
      programId,
      operator: attacker.publicKey,
      payer: attacker.publicKey,
      mint,
      recipientOwner: attacker.publicKey,
      withdrawalId: id,
      amount: 1n * UNIT,
    });
    const sent = await sendTx(conn, instructions, [attacker], { skipPreflight: true });
    expect(customErrorOf(sent.err)).toEqual({ index: 1, code: BridgeError.Unauthorized });
    expect(await balance(vault)).toBe(vaultBefore);
    expect(await conn.getAccountInfo(findReceiptAddress(programId, id)[0], "confirmed")).toBeNull();
  }, TX_TIMEOUT);

  test("a second release for the same id is refused on chain (AlreadyReleased)", async () => {
    const vaultBefore = await balance(vault);
    const { destination, instructions } = createReleaseWithAtaInstructions({
      programId,
      operator: operator.publicKey,
      payer: operator.publicKey,
      mint,
      recipientOwner: recipientOwner.publicKey,
      withdrawalId: releasedId,
      amount: RELEASE_AMOUNT,
    });
    const sent = await sendTx(conn, instructions, [operator], { skipPreflight: true });
    expect(customErrorOf(sent.err)).toEqual({ index: 1, code: BridgeError.AlreadyReleased });
    expect(await balance(vault)).toBe(vaultBefore);
    expect(await balance(destination)).toBe(RELEASE_AMOUNT);
  }, TX_TIMEOUT);

  test("a release of zero is refused on chain (ZeroAmount)", async () => {
    const id = testWithdrawalId();
    const vaultBefore = await balance(vault);
    const { instructions } = createReleaseWithAtaInstructions({
      programId,
      operator: operator.publicKey,
      payer: operator.publicKey,
      mint,
      recipientOwner: recipientOwner.publicKey,
      withdrawalId: id,
      amount: 0n,
    });
    const sent = await sendTx(conn, instructions, [operator], { skipPreflight: true });
    expect(customErrorOf(sent.err)).toEqual({ index: 1, code: BridgeError.ZeroAmount });
    expect(await balance(vault)).toBe(vaultBefore);
    expect(await fetchReceipt(conn, programId, id)).toBeNull();
  }, TX_TIMEOUT);
});

// ── 00058: LockToContract (tag 3) ────────────────────────────────────────────
const CONTRACT = Buffer.alloc(32, 0xa1);
/** A raw tag-3 instruction with Lock's accounts (for the data the builder refuses up front). */
function rawLockToContract(data: Buffer, signer = true, src?: PublicKey): TransactionInstruction {
  const ix = createLockToContractInstruction({ programId, depositor: depositor.publicKey, source: src ?? depositorAta, mint, amount: 1n, contract: CONTRACT });
  return new TransactionInstruction({
    programId,
    keys: ix.keys.map((k, i) => (i === 0 ? { ...k, isSigner: signer } : k)),
    data,
  });
}
const tag3 = (amount: bigint, contract: Buffer) => {
  const a = Buffer.alloc(8);
  a.writeBigUInt64LE(amount);
  return Buffer.concat([Buffer.from([IX_LOCK_TO_CONTRACT]), a, contract]);
};

describe("LockToContract on a local validator (00058 I-2)", () => {
  test("(a) a lock to a contract moves the amount into the vault and logs LOCKC", async () => {
    const nonce = (await fetchBridgeConfig(conn, programId))!.lockNonce;
    const vaultBefore = await balance(vault);
    const depositorBefore = await balance(depositorAta);
    const sent = await sendTx(
      conn,
      [createLockToContractInstruction({ programId, depositor: depositor.publicKey, source: depositorAta, mint, amount: 500n, contract: CONTRACT })],
      [depositor],
    );
    expect(sent.err).toBeNull();
    const line = `EFFECTSTREAM_BRIDGE|LOCKC|${nonce}|${depositor.publicKey.toBase58()}|${mint.toBase58()}|500|${CONTRACT.toString("hex")}`;
    expect(sent.logs).toContain(`Program log: ${line}`);
    expect(parseBridgeLogs(sent.logs)).toEqual([
      { kind: "LOCKC", nonce, depositor: depositor.publicKey.toBase58(), mint: mint.toBase58(), amount: 500n, contractHex: CONTRACT.toString("hex") },
    ]);
    expect(await balance(vault)).toBe(vaultBefore + 500n);
    expect(await balance(depositorAta)).toBe(depositorBefore - 500n);
    expect((await fetchBridgeConfig(conn, programId))!.lockNonce).toBe(nonce + 1n);
  }, TX_TIMEOUT);

  test("(b) Lock, LockToContract, Lock in one transaction take consecutive nonces from one counter", async () => {
    const nonce = (await fetchBridgeConfig(conn, programId))!.lockNonce;
    const lock = () => createLockInstruction({ programId, depositor: depositor.publicKey, source: depositorAta, mint, amount: 1n, midnightRecipient: randomBytes(64) });
    const sent = await sendTx(
      conn,
      [lock(), createLockToContractInstruction({ programId, depositor: depositor.publicKey, source: depositorAta, mint, amount: 2n, contract: CONTRACT }), lock()],
      [depositor],
    );
    expect(sent.err).toBeNull();
    expect(lockNoncesFromLogs(sent.logs)).toEqual([
      { kind: "LOCK", nonce },
      { kind: "LOCKC", nonce: nonce + 1n },
      { kind: "LOCK", nonce: nonce + 2n },
    ]);
    expect((await fetchBridgeConfig(conn, programId))!.lockNonce).toBe(nonce + 3n);
  }, TX_TIMEOUT);

  const refused: Array<[string, () => TransactionInstruction, number]> = [
    ["(c) a zero amount is refused (ZeroAmount)", () => rawLockToContract(tag3(0n, CONTRACT)), BridgeError.ZeroAmount],
    ["(d) an all-zero contract is refused (InvalidRecipient)", () => rawLockToContract(tag3(5n, Buffer.alloc(32))), BridgeError.InvalidRecipient],
    ["(e) 40-byte data is refused (InvalidInstruction)", () => rawLockToContract(tag3(5n, CONTRACT).subarray(0, 40)), BridgeError.InvalidInstruction],
    ["(e) 42-byte data is refused (InvalidInstruction)", () => rawLockToContract(Buffer.concat([tag3(5n, CONTRACT), Buffer.from([0xa1])])), BridgeError.InvalidInstruction],
  ];
  for (const [name, build, code] of refused) {
    test(`${name} on chain, nothing moved`, async () => {
      const nonce = (await fetchBridgeConfig(conn, programId))!.lockNonce;
      const vaultBefore = await balance(vault);
      const sent = await sendTx(conn, [build()], [depositor], { skipPreflight: true });
      expect(customErrorOf(sent.err)).toEqual({ index: 0, code });
      expect(await balance(vault)).toBe(vaultBefore);
      expect((await fetchBridgeConfig(conn, programId))!.lockNonce).toBe(nonce);
    }, TX_TIMEOUT);
  }

  test("(f) a depositor that does not sign is refused (MissingRequiredSignature)", async () => {
    const vaultBefore = await balance(vault);
    const sent = await sendTx(conn, [rawLockToContract(tag3(5n, CONTRACT), false)], [attacker], { skipPreflight: true });
    expect(sent.err).toEqual({ InstructionError: [0, "MissingRequiredSignature"] });
    expect(await balance(vault)).toBe(vaultBefore);
  }, TX_TIMEOUT);

  test("(g) a source of another mint is refused by the Token program", async () => {
    const other = await createMint(conn, operator, operator.publicKey, null, 6);
    const prelude = createAtaIdempotentPrelude({ payer: operator.publicKey, owner: depositor.publicKey, mint: other });
    await sendTx(conn, [prelude.instruction, createMintToInstruction(other, prelude.ata, operator.publicKey, 10n)], [operator]);
    const nonce = (await fetchBridgeConfig(conn, programId))!.lockNonce;
    const vaultBefore = await balance(vault);
    const sent = await sendTx(
      conn,
      [createLockToContractInstruction({ programId, depositor: depositor.publicKey, source: prelude.ata, mint, amount: 5n, contract: CONTRACT })],
      [depositor],
      { skipPreflight: true },
    );
    expect(sent.err).not.toBeNull();
    expect(await balance(vault)).toBe(vaultBefore);
    expect(await balance(prelude.ata)).toBe(10n);
    expect((await fetchBridgeConfig(conn, programId))!.lockNonce).toBe(nonce);
  }, TX_TIMEOUT);
});

// (h), tag 3 against the 00050 program, is in solana-program-00050.test.ts: it needs its own
// validator, and two validators in one (emulated) container do not come up.
