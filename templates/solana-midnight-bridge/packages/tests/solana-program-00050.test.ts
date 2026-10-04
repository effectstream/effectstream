// 00058 I-2 (h): `LockToContract` fails closed on a program built before tag 3. A throwaway
// validator (random ports >= 10000) preloads the 00050 build (fixtures/bridge-00050.so, sha256
// a443552f…) at the local program id; tag 3 must be refused with InvalidInstruction and nothing
// may move. Its own file: solana-program.test.ts's validator must be stopped first (two validators
// in one emulated container do not come up).
//
// Run: bun test ./solana-program-00050.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { BridgeError, LOCAL_BRIDGE_PROGRAM_ID } from "@solana-midnight-bridge/contracts-solana/program-id";
import {
  createAtaIdempotentPrelude,
  createLockToContractInstruction,
  findVaultAddress,
} from "@solana-midnight-bridge/contracts-solana/instructions";
import { airdropAtLeast, customErrorOf, fetchBridgeConfig, sendTx } from "@solana-midnight-bridge/contracts-solana/chain";
import { initLocal } from "@solana-midnight-bridge/contracts-solana/init-local";
import { startTestValidator, type TestValidator } from "./helpers/validator.ts";

const TX_TIMEOUT = 120_000;
const programId = new PublicKey(LOCAL_BRIDGE_PROGRAM_ID);
const CONTRACT = Buffer.alloc(32, 0xa1);

describe("(h) the 00050 program refuses LockToContract: it fails closed", () => {
  const OLD_SO = path.resolve(import.meta.dirname!, "fixtures/bridge-00050.so");
  let old: TestValidator | null = null;
  let oldConn: Connection;
  let oldTmp: string;

  beforeAll(async () => {
    oldTmp = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-program-test-00050-"));
    old = await startTestValidator(300_000, OLD_SO);
    oldConn = new Connection(old.rpcUrl, "confirmed");
    await initLocal({ rpcUrl: old.rpcUrl, deployment: path.join(oldTmp, "old.json"), log: (l) => console.log(`  [init-local 00050] ${l}`) });
  }, 600_000);

  afterAll(() => {
    old?.stop();
    if (oldTmp) fs.rmSync(oldTmp, { recursive: true, force: true });
  });

  test("tag 3 against the 00050 .so → InvalidInstruction, nothing locked", async () => {
    const so = fs.readFileSync(OLD_SO);
    expect(new Bun.CryptoHasher("sha256").update(so).digest("hex")).toBe("a443552ffc1f4012a7a8da562f43f80d0c2d86edaf1c2d3257a73d37bb88e38e");
    const cfg = (await fetchBridgeConfig(oldConn, programId))!;
    const oldMint = new PublicKey(cfg.mint);
    // A fresh depositor with an empty token account: the old program refuses tag 3 at dispatch,
    // before any account is read, so nothing could move either way.
    const who = Keypair.generate();
    await airdropAtLeast(oldConn, who.publicKey, 2);
    const prelude = createAtaIdempotentPrelude({ payer: who.publicKey, owner: who.publicKey, mint: oldMint });
    await sendTx(oldConn, [prelude.instruction], [who]);
    const vaultOld = findVaultAddress(programId, oldMint)[0];
    const vaultBefore = (await getAccount(oldConn, vaultOld, "confirmed")).amount;
    const sent = await sendTx(
      oldConn,
      [createLockToContractInstruction({ programId, depositor: who.publicKey, source: prelude.ata, mint: oldMint, amount: 1n, contract: CONTRACT })],
      [who],
      { skipPreflight: true },
    );
    expect(customErrorOf(sent.err)).toEqual({ index: 0, code: BridgeError.InvalidInstruction });
    expect((await getAccount(oldConn, vaultOld, "confirmed")).amount).toBe(vaultBefore);
    expect((await fetchBridgeConfig(oldConn, programId))!.lockNonce).toBe(cfg.lockNonce);
  }, TX_TIMEOUT);
});

