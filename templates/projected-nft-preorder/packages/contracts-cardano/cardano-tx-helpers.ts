import {
  Lucid,
  Constr,
  Data,
  SLOT_CONFIG_NETWORK,
  unixTimeToEnclosingSlot,
  type LucidEvolution,
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
import type { SpendingValidator } from "@lucid-evolution/core-types";
import * as fs from "node:fs";
import * as path from "node:path";

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

export interface FreshLucidResult {
  lucid: LucidEvolution;
  address: string;
  paymentCredential: string;
  stakingCredential: string;
  seedPhrase: string;
}

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

export async function initLucid(): Promise<LucidEvolution> {
  if (cachedLucid) return cachedLucid;

  await ensureYaciSlotConfig();

  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");
  provider.evaluateTx = async (_tx: string, _utxos?: any) => {
    return [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }];
  };
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

export async function createFreshLucid(): Promise<FreshLucidResult> {
  const lucid = await initLucid();
  const address = cachedAddress!;
  const details = getAddressDetails(address);
  return {
    lucid,
    address,
    paymentCredential: details.paymentCredential?.hash ?? "",
    stakingCredential: details.stakeCredential?.hash ?? "",
    seedPhrase: cachedSeed!,
  };
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

function loadHololockerValidator(): SpendingValidator {
  const plutusJsonPath = path.resolve(import.meta.dirname!, "plutus.json");
  const plutusJson = JSON.parse(fs.readFileSync(plutusJsonPath, "utf-8"));
  const spendValidator = plutusJson.validators.find((v: any) => v.title === "hololocker.spend");
  if (!spendValidator) throw new Error("hololocker.spend validator not found in plutus.json");
  return {
    type: "PlutusV2",
    script: applyDoubleCborEncoding(spendValidator.compiledCode),
  };
}

export function getHololockerScriptHash(): string {
  const validator = loadHololockerValidator();
  return validatorToScriptHash(validator);
}

export function getHololockerScriptAddress(): string {
  const validator = loadHololockerValidator();
  return validatorToAddress("Custom", validator);
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
  return Data.to(new Constr(1, [
    new Constr(0, [
      new Constr(0, []),
      new Constr(1, []),
      new Constr(1, []),
    ]),
  ]));
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

  const utxos = await lucid.utxosAt(scriptAddress);
  const lockUtxo = utxos.find((u) => u.txHash === lockTxHash && u.outputIndex === lockOutputIndex);
  if (!lockUtxo) throw new Error(`Lock UTXO not found: ${lockTxHash}#${lockOutputIndex}`);

  const now = Date.now();
  const validityUpperMs = now + 15_000;
  const validityUpperSlot = unixTimeToEnclosingSlot(validityUpperMs, slotConfig);
  const upperPosix = cachedSystemStartMs + validityUpperSlot * 1000;
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

  const utxos = await lucid.utxosAt(scriptAddress);
  const unlockingUtxo = utxos.find((u) => u.txHash === unlockTxHash);
  if (!unlockingUtxo) throw new Error(`Unlocking UTXO not found: ${unlockTxHash}`);

  const redeemer = makeFullWithdrawRedeemer();

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
