/**
 * Cardano Transaction Helpers for E2E Tests
 *
 * Uses Lucid Evolution to build and submit Cardano transactions
 * against the YACI DevKit local devnet (protocol magic 42).
 *
 * Dolos MiniBF (Blockfrost-compatible API) on port 3000 is used as the provider.
 */

import {
  Lucid,
  Constr,
  Data,
  SLOT_CONFIG_NETWORK,
  unixTimeToEnclosingSlot,
  slotToBeginUnixTime,
  type LucidEvolution,
  type TxSignBuilder,
} from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  mintingPolicyToId,
  toUnit,
  getAddressDetails,
  scriptFromNative,
  paymentCredentialOf,
  validatorToAddress,
  validatorToScriptHash,
  applyDoubleCborEncoding,
  PROTOCOL_PARAMETERS_DEFAULT,
} from "@lucid-evolution/utils";
import type { SpendingValidator, SlotConfig } from "@lucid-evolution/core-types";
import path from "path";

const DOLOS_BLOCKFROST_URL = "http://localhost:3000";
const YACI_ADMIN_URL = "http://localhost:10000";

function toHex(text: string): string {
  return Buffer.from(text, "utf-8").toString("hex");
}

export const YACI_GENESIS_POOL_HASH =
  "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57";
export const YACI_GENESIS_POOL_BECH32 =
  "pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy";

let cachedLucid: LucidEvolution | null = null;
let cachedAddress: string | null = null;
let cachedSeed: string | null = null;

async function topup(address: string, adaAmount: number): Promise<void> {
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/addresses/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, adaAmount }),
      });
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Topup failed for ${address}`);
}

async function waitForUtxos(lucid: LucidEvolution, address: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const utxos = await lucid.utxosAt(address);
    if (utxos.length > 0) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for UTxOs");
}

export async function initLucid(): Promise<LucidEvolution> {
  if (cachedLucid) return cachedLucid;

  await ensureYaciSlotConfig();

  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");
  // Dolos MiniBF doesn't support tx evaluation — return generous ex-units
  provider.evaluateTx = async (_tx: string, _utxos?: any) => {
    return [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }];
  };
  // Dolos MiniBF is read-only — override submitTx to submit via YACI's submit API
  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: Buffer.from(tx, "hex"),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YACI tx submit failed (${res.status}): ${text}`);
    }
    const result = await res.text();
    return result.replace(/^"|"$/g, "");
  };
  const lucid = await Lucid(provider, "Custom", {
    presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
  });

  cachedSeed = generateSeedPhrase();
  lucid.selectWallet.fromSeed(cachedSeed);

  cachedAddress = (await lucid.wallet().address());
  console.log(`[Lucid] Wallet address: ${cachedAddress}`);

  await topup(cachedAddress, 10_000);
  console.log("[Lucid] Topup submitted, waiting for UTxOs...");

  await waitForUtxos(lucid, cachedAddress);
  console.log("[Lucid] UTxOs available, wallet ready.");

  cachedLucid = lucid;
  return lucid;
}

export function getTestAddress(): string {
  if (!cachedAddress) throw new Error("Call initLucid first");
  return cachedAddress;
}

function makeNativeMintingPolicy(lucid: LucidEvolution) {
  const addr = cachedAddress!;
  const paymentCred = paymentCredentialOf(addr);
  const nativeScript = scriptFromNative({ type: "sig", keyHash: paymentCred.hash });
  const policyId = mintingPolicyToId(nativeScript);
  return { policyId, mintingPolicy: nativeScript };
}

let cachedPolicy: ReturnType<typeof makeNativeMintingPolicy> | null = null;

export function getTestPolicyId(): string {
  if (!cachedPolicy) throw new Error("Call mintTokens first");
  return cachedPolicy.policyId;
}

export async function mintTokens(
  lucid: LucidEvolution,
  assetName: string,
  amount: bigint,
): Promise<{ txHash: string; policyId: string }> {
  if (!cachedPolicy) {
    cachedPolicy = makeNativeMintingPolicy(lucid);
  }
  const { policyId, mintingPolicy } = cachedPolicy;

  const unit = toUnit(policyId, toHex(assetName));
  const tx = lucid
    .newTx()
    .mintAssets({ [unit]: amount })
    .attach.MintingPolicy(mintingPolicy);

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] Mint TX submitted: ${txHash} (policy=${policyId}, asset=${assetName}, amount=${amount})`);

  await lucid.awaitTx(txHash);
  return { txHash, policyId };
}

export async function burnTokens(
  lucid: LucidEvolution,
  policyId: string,
  assetName: string,
  amount: bigint,
): Promise<{ txHash: string }> {
  if (!cachedPolicy || cachedPolicy.policyId !== policyId) {
    throw new Error("Can only burn with the test minting policy");
  }
  const { mintingPolicy } = cachedPolicy;
  const unit = toUnit(policyId, toHex(assetName));

  const tx = lucid
    .newTx()
    .mintAssets({ [unit]: -amount })
    .attach.MintingPolicy(mintingPolicy);

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] Burn TX submitted: ${txHash} (policy=${policyId}, asset=${assetName}, amount=-${amount})`);

  await lucid.awaitTx(txHash);
  return { txHash };
}

export async function transferWithAssets(
  lucid: LucidEvolution,
  to: string,
  lovelace: bigint,
  assets?: Record<string, bigint>,
): Promise<{ txHash: string }> {
  const payAssets: Record<string, bigint> = { lovelace, ...assets };

  const tx = lucid
    .newTx()
    .pay.ToAddress(to, payAssets);

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] Transfer TX submitted: ${txHash}`);

  await lucid.awaitTx(txHash);
  return { txHash };
}

export async function delegateToPool(
  lucid: LucidEvolution,
  poolId: string,
): Promise<{ txHash: string }> {
  // Derive the reward address from the seed
  const details = getAddressDetails(cachedAddress!);
  if (!details.stakeCredential) {
    throw new Error("Wallet address has no stake credential — use a Base address");
  }

  // For YACI, we need to use the Preprod-style reward address derivation
  // registerAndDelegate handles both registration and delegation in one tx
  const rewardAddress = (await lucid.wallet().rewardAddress())!;
  if (!rewardAddress) {
    throw new Error("No reward address available from wallet");
  }

  const tx = lucid
    .newTx()
    .registerAndDelegate.ToPool(rewardAddress, poolId);

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] Delegation TX submitted: ${txHash} (pool=${poolId})`);

  await lucid.awaitTx(txHash);
  return { txHash };
}

// ── Projected NFT (Hololocker) Helpers ───────────────────────────────────────

let slotConfigInitialized = false;
let cachedSystemStartMs = 0;

async function ensureYaciSlotConfig(force = false): Promise<void> {
  if (slotConfigInitialized && !force) return;
  const devnetRes = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/admin/devnet`);
  const devnet = await devnetRes.json();
  const startTimeMs = devnet.startTime * 1000;
  SLOT_CONFIG_NETWORK["Custom"] = {
    zeroTime: startTimeMs,
    zeroSlot: 0,
    slotLength: 1000,
  };
  const genesisRes = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/admin/devnet/genesis/shelley`);
  const genesis = await genesisRes.json();
  cachedSystemStartMs = Math.floor(new Date(genesis.systemStart).getTime());
  console.log(`[SlotConfig] zeroTime=${startTimeMs} systemStart=${cachedSystemStartMs}`);
  slotConfigInitialized = true;
}

function loadHololockerValidator(): SpendingValidator {
  const plutusJsonPath = path.resolve(import.meta.dirname!, "./hololocker-demo/plutus.json");
  const plutusJson = JSON.parse(require("fs").readFileSync(plutusJsonPath, "utf-8"));
  const spendValidator = plutusJson.validators.find((v: any) => v.title === "hololocker.spend");
  if (!spendValidator) throw new Error("hololocker.spend validator not found in plutus.json");
  return {
    type: "PlutusV2",
    script: applyDoubleCborEncoding(spendValidator.compiledCode),
  };
}

function makePkhLockDatum(walletPKH: string): string {
  return Data.to(new Constr(0, [
    new Constr(0, [walletPKH]),
    new Constr(0, []),
  ]));
}

function makePkhUnlockingDatum(walletPKH: string, lockTxHash: string, lockOutputIndex: number, forHowLong: bigint): string {
  return Data.to(new Constr(0, [
    new Constr(0, [walletPKH]),
    new Constr(1, [
      new Constr(0, [
        new Constr(0, [lockTxHash]),
        BigInt(lockOutputIndex),
      ]),
      forHowLong,
    ]),
  ]));
}

function makeFullWithdrawRedeemer(): string {
  // Wrapped in Constr(1, [...]) for multi-validator spend redeemer detection
  return Data.to(new Constr(1, [
    new Constr(0, [
      new Constr(0, []),
      new Constr(1, []),
      new Constr(1, []),
    ]),
  ]));
}

export function getHololockerScriptHash(): string {
  const validator = loadHololockerValidator();
  return validatorToScriptHash(validator);
}

export async function lockNftAtScript(
  lucid: LucidEvolution,
  nftUnit: string,
  lovelace: bigint = 2_000_000n,
): Promise<{ txHash: string; scriptAddress: string; outputIndex: number }> {
  const validator = loadHololockerValidator();
  const scriptAddress = validatorToAddress("Custom", validator);

  const walletAddr = await lucid.wallet().address();
  const paymentCred = paymentCredentialOf(walletAddr);
  const lockDatum = makePkhLockDatum(paymentCred.hash);

  const tx = lucid
    .newTx()
    .pay.ToAddressWithData(scriptAddress, { kind: "inline", value: lockDatum }, { lovelace, [nftUnit]: 1n });

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Hololocker] Lock TX submitted: ${txHash}`);

  await lucid.awaitTx(txHash);

  // Find the output index at the script address
  const utxos = await lucid.utxosAt(scriptAddress);
  const lockUtxo = utxos.find((u) => u.txHash === txHash);
  const outputIndex = lockUtxo?.outputIndex ?? 0;

  return { txHash, scriptAddress, outputIndex };
}

export async function unlockNftFromScript(
  lucid: LucidEvolution,
  scriptAddress: string,
  lockTxHash: string,
  lockOutputIndex: number,
): Promise<{ txHash: string; forHowLong: bigint; claimableAfterMs: number }> {
  await ensureYaciSlotConfig(true);
  const validator = loadHololockerValidator();
  const walletAddr = await lucid.wallet().address();
  const paymentCred = paymentCredentialOf(walletAddr);
  const slotConfig = SLOT_CONFIG_NETWORK["Custom"];

  // Find the locked UTXO
  const utxos = await lucid.utxosAt(scriptAddress);
  const lockUtxo = utxos.find((u) => u.txHash === lockTxHash && u.outputIndex === lockOutputIndex);
  if (!lockUtxo) throw new Error(`Lock UTXO not found: ${lockTxHash}#${lockOutputIndex}`);

  // Set validity upper bound — keep tight so forHowLong is soon
  const now = Date.now();
  const validityUpperMs = now + 15_000;
  const validityUpperSlot = unixTimeToEnclosingSlot(validityUpperMs, slotConfig);
  // The node converts TTL slot to POSIX time using systemStart (Shelley genesis),
  // not startTime (devnet launch). These differ by one epoch (600s).
  const upperPosix = cachedSystemStartMs + validityUpperSlot * 1000;
  // Must match the hololocker-demo's minimum_lock_time (5 ms)
  const forHowLong = BigInt(upperPosix) + 5n;
  console.log(`[Hololocker] Unlock: forHowLong=${forHowLong} (slot=${validityUpperSlot})`);

  const unlockingDatum = makePkhUnlockingDatum(
    paymentCred.hash,
    lockTxHash,
    lockOutputIndex,
    forHowLong,
  );
  const redeemer = makeFullWithdrawRedeemer();

  const tx = lucid
    .newTx()
    .collectFrom([lockUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddressWithData(scriptAddress, { kind: "inline", value: unlockingDatum }, lockUtxo.assets)
    .validTo(validityUpperMs)
    .addSigner(walletAddr);

  const signed = await (await tx.complete({ localUPLCEval: false })).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Hololocker] Unlock TX submitted: ${txHash} (forHowLong=${forHowLong})`);

  await lucid.awaitTx(txHash);

  // forHowLong is in systemStart-based POSIX time (used by Plutus script context).
  // Convert to wall clock time for the caller's wait calculation.
  const epochOffset = cachedSystemStartMs - slotConfig.zeroTime;
  const claimableAfterMs = Number(forHowLong) - epochOffset + 1000;
  return { txHash, forHowLong, claimableAfterMs };
}

export async function claimNftFromScript(
  lucid: LucidEvolution,
  scriptAddress: string,
  unlockTxHash: string,
  forHowLong: bigint,
): Promise<{ txHash: string }> {
  await ensureYaciSlotConfig(true);
  const validator = loadHololockerValidator();
  const walletAddr = await lucid.wallet().address();
  const slotConfig = SLOT_CONFIG_NETWORK["Custom"];

  // Find the unlocking UTXO
  const utxos = await lucid.utxosAt(scriptAddress);
  const unlockingUtxo = utxos.find((u) => u.txHash === unlockTxHash);
  if (!unlockingUtxo) throw new Error(`Unlocking UTXO not found: ${unlockTxHash}`);

  const redeemer = makeFullWithdrawRedeemer();

  // forHowLong is in systemStart-based POSIX time (Plutus script context).
  // Lucid's validFrom converts wall clock → slot using startTime (zeroTime).
  // We need the resulting slot's POSIX time (systemStart + slot*1000) to be >= forHowLong.
  const epochOffset = cachedSystemStartMs - slotConfig.zeroTime;
  const validFromMs = Number(forHowLong) - epochOffset + 1000;
  console.log(`[Hololocker] Claim: validFrom=${validFromMs} (forHowLong=${forHowLong})`);

  const tx = lucid
    .newTx()
    .collectFrom([unlockingUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .validFrom(validFromMs)
    .addSigner(walletAddr);

  const signed = await (await tx.complete({ localUPLCEval: false })).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Hololocker] Claim TX submitted: ${txHash}`);

  await lucid.awaitTx(txHash);
  return { txHash };
}
