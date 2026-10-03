// T-C1 on a LOCAL Midnight 2.x devnet: the bridge contract proved and
// submitted for real (contract prover 9.0.0-rc.8, DUST prover rc.5/rc.6).
//
// Needs a running devnet (node + indexer) and both provers, e.g. `bun run dev`
// or the S4 Docker harness. Endpoints come from the usual variables
// (MIDNIGHT_INDEXER_HTTP, MIDNIGHT_INDEXER_WS, MIDNIGHT_NODE_HTTP,
// MIDNIGHT_PROOF_SERVER_URL, MIDNIGHT_CONTRACT_PROOF_SERVER_URL); defaults are
// the local ports. When the devnet or a prover is unreachable the suite is
// SKIPPED, with the reason printed (it never fails for a missing chain).
//
// It deploys its OWN bridge instance (fresh operator key, stand-in 32-byte SPL
// mint), so it never touches the orchestrator's deployment, and uses the
// public dev wallets 0x…01 (operator / payer) and 0x…03 (user2).
//
//   1. a direct mint (not through the relayer) with a valid operator signature
//      → the recipient wallet sees +10 of the bridge colour;
//   2. a signature by another key       → refused, 'bad signature';
//   3. a signature over another amount  → refused, 'bad signature';
//   4. the already-minted nonce again   → refused, 'lock already minted';
//   5. lockForSolana with another colour → refused, 'not the bridge colour';
//   6. lockForSolana of 4 of the 10     → withdrawal 0 recorded, the wallet keeps 6.
//
// Run: bun test --timeout 1800000 ./contract.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import * as Rx from "rxjs";
import { deployMidnightContract, type WalletResult } from "@effectstream/midnight-contracts";
import {
  BridgeContract,
  CONTRACT_NAME,
  CONTRACTS_BASE_DIR,
  buildBridgeWallet,
  bytesToHex,
  localDevSeed,
  midnightUrls,
  networkTagFor,
  operatorKeyFromSolanaPublicKey,
  shieldedKeysFromSeed,
  shieldedRecipient,
  signMint,
  tokenColor,
} from "@solana-midnight-bridge/contracts-midnight";
import { checkProvers, latestIndexerHeight } from "@solana-midnight-bridge/contracts-midnight/deploy";
import {
  bridgeProviders,
  lockForSolana,
  mintFromSolana,
  readBridgeLedger,
} from "@solana-midnight-bridge/contracts-midnight/client";

const urls = midnightUrls("local");
const rnd = (n: number) => new Uint8Array(randomBytes(n));

async function devnetUnavailableReason(): Promise<string | null> {
  try {
    await latestIndexerHeight(urls.indexer);
  } catch (e) {
    return `indexer ${urls.indexer} unreachable (${(e as Error).message})`;
  }
  try {
    await checkProvers(urls);
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

const skipReason = await devnetUnavailableReason();
if (skipReason) {
  console.warn(`[contract.test] SKIPPED: no local Midnight devnet with both provers (${skipReason}). ` +
    "Run it in the S4 Docker harness (pending Q11 on this host) or with `bun run dev`.");
}

const operator = nacl.sign.keyPair();
const stranger = nacl.sign.keyPair();
const sourceMint = rnd(32);

async function colorBalance(w: WalletResult, colorHex: string): Promise<bigint> {
  const s: any = await Rx.firstValueFrom((w.wallet as any).state());
  return BigInt(s.shielded?.balances?.[colorHex] ?? 0n);
}

async function waitColorBalance(w: WalletResult, colorHex: string, want: bigint, timeoutMs = 600_000): Promise<bigint> {
  const s: any = await Rx.firstValueFrom(
    (w.wallet as any).state().pipe(
      Rx.filter((st: any) => BigInt(st.shielded?.balances?.[colorHex] ?? 0n) === want),
      Rx.timeout({ each: timeoutMs, with: () => Rx.throwError(() => new Error(`timeout waiting for balance ${want}`)) }),
    ),
  );
  return BigInt(s.shielded.balances[colorHex]);
}

async function refusedWith(p: Promise<unknown>, text: string): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    let cur: any = e;
    const parts: string[] = [];
    for (let i = 0; cur && i < 6; i++) {
      parts.push(String(cur?.message ?? cur));
      cur = cur?.cause;
    }
    return parts.join(" <- ").includes(text);
  }
}

describe.skipIf(skipReason !== null)("bridge contract on a local devnet (T-C1)", () => {
  let contractAddress = "";
  let colorHex = "";
  let payer: WalletResult;
  let user: WalletResult;
  let payerProviders: any;
  let userProviders: any;
  const userSeed = localDevSeed("user2");
  const userKeys = shieldedKeysFromSeed(userSeed);
  const recipient = shieldedRecipient(Uint8Array.from(Buffer.from(userKeys.coinPublicKey, "hex")));
  const mapping: [string, string] = [userKeys.coinPublicKey, userKeys.encryptionPublicKey];
  const tag = networkTagFor(urls.id);

  beforeAll(async () => {
    process.env.MIDNIGHT_STORAGE_PASSWORD ??= "BridgeLocalDevOnly-1!";
    const deployer = await buildBridgeWallet(urls, localDevSeed("operator"));
    contractAddress = await deployMidnightContract(
      {
        contractName: CONTRACT_NAME,
        contractClass: BridgeContract,
        baseDir: CONTRACTS_BASE_DIR,
        deployArgs: [operatorKeyFromSolanaPublicKey(operator.publicKey), sourceMint, tag],
        privateStateStoreName: `bridge-test-${Date.now()}`,
        witnesses: {},
      },
      { ...urls },
      undefined,
      { walletResult: deployer },
    ); // stops `deployer`
    colorHex = bytesToHex(tokenColor(sourceMint, Uint8Array.from(Buffer.from(contractAddress, "hex"))));
    payer = await buildBridgeWallet(urls, localDevSeed("operator"));
    user = await buildBridgeWallet(urls, userSeed);
    payerProviders = await bridgeProviders(payer, urls, `bridge-test-payer-${Date.now()}`);
    userProviders = await bridgeProviders(user, urls, `bridge-test-user-${Date.now()}`);
  }, 1_800_000);

  afterAll(async () => {
    for (const w of [payer, user]) {
      try {
        await w?.wallet.stop();
      } catch {
        /* ignore */
      }
    }
  });

  const addr = () => Uint8Array.from(Buffer.from(contractAddress, "hex"));
  const sign = (key: nacl.SignKeyPair, lockNonce: bigint, amount: bigint) =>
    signMint(key.secretKey, { contractAddress: addr(), networkTag: tag, lockNonce, recipient, amount }).sig;

  test("a valid operator signature mints 10 to the third-party wallet", async () => {
    const before = await colorBalance(user, colorHex);
    const r = await mintFromSolana(payerProviders, contractAddress, {
      lockNonce: 1n, recipient, amount: 10n, sig: sign(operator, 1n, 10n), mapping,
    });
    expect(r.txHash).toBeTruthy();
    expect(r.result.value).toBe(10n);
    expect(await waitColorBalance(user, colorHex, before + 10n)).toBe(before + 10n);
  }, 900_000);

  test("a signature by another key is refused", async () => {
    expect(await refusedWith(
      mintFromSolana(payerProviders, contractAddress, { lockNonce: 2n, recipient, amount: 10n, sig: sign(stranger, 2n, 10n), mapping }),
      "bad signature",
    )).toBe(true);
  }, 300_000);

  test("a signature over another amount is refused", async () => {
    expect(await refusedWith(
      mintFromSolana(payerProviders, contractAddress, { lockNonce: 2n, recipient, amount: 11n, sig: sign(operator, 2n, 10n), mapping }),
      "bad signature",
    )).toBe(true);
  }, 300_000);

  test("the already-minted nonce is refused", async () => {
    expect(await refusedWith(
      mintFromSolana(payerProviders, contractAddress, { lockNonce: 1n, recipient, amount: 10n, sig: sign(operator, 1n, 10n), mapping }),
      "lock already minted",
    )).toBe(true);
    const L = await readBridgeLedger(payerProviders, contractAddress);
    expect(L?.mintedLocks.size()).toBe(1n);
  }, 300_000);

  test("lockForSolana with another colour is refused", async () => {
    expect(await refusedWith(
      lockForSolana(userProviders, contractAddress, { color: rnd(32), amount: 4n, solanaRecipient: rnd(32) }),
      "not the bridge colour",
    )).toBe(true);
  }, 300_000);

  test("lockForSolana burns 4 of 10, records withdrawal 0, and the wallet keeps 6", async () => {
    const before = await colorBalance(user, colorHex);
    const solanaRecipient = rnd(32);
    const r = await lockForSolana(userProviders, contractAddress, {
      color: Uint8Array.from(Buffer.from(colorHex, "hex")), amount: 4n, solanaRecipient,
    });
    expect(r.result).toBe(0n);
    expect(await waitColorBalance(user, colorHex, before - 4n)).toBe(before - 4n);
    const L = await readBridgeLedger(payerProviders, contractAddress);
    expect(L?.withdrawals.lookup(0n).amount).toBe(4n);
    expect(bytesToHex(L!.withdrawals.lookup(0n).solanaRecipient)).toBe(bytesToHex(solanaRecipient));
  }, 900_000);
});
