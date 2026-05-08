import {
  SLOT_CONFIG_NETWORK,
  unixTimeToEnclosingSlot,
  type LucidEvolution,
} from "@lucid-evolution/lucid";
import {
  mintingPolicyToId,
  toUnit,
  paymentCredentialOf,
  scriptFromNative,
  validatorToAddress,
} from "@lucid-evolution/utils";
import {
  getHololockerValidator,
  makePkhLockDatum,
  makePkhUnlockingDatum,
  makeFullWithdrawRedeemer,
} from "./hololocker.ts";
import { ensureSlotConfig, getSystemStartMs } from "./wallet.ts";
import { toHex } from "../utils.ts";

function makeNativeMintingPolicy(lucid: LucidEvolution, address: string) {
  const paymentCred = paymentCredentialOf(address);
  const nativeScript = scriptFromNative({ type: "sig", keyHash: paymentCred.hash });
  const policyId = mintingPolicyToId(nativeScript);
  return { policyId, mintingPolicy: nativeScript };
}

export async function mintTokens(
  lucid: LucidEvolution,
  assetName: string,
  amount: bigint = 1n,
): Promise<{ txHash: string; policyId: string }> {
  const address = await lucid.wallet().address();
  const { policyId, mintingPolicy } = makeNativeMintingPolicy(lucid, address);

  const unit = toUnit(policyId, toHex(assetName));
  const tx = lucid
    .newTx()
    .mintAssets({ [unit]: amount })
    .attach.MintingPolicy(mintingPolicy);

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  await lucid.awaitTx(txHash);

  return { txHash, policyId };
}

export async function lockNftAtScript(
  lucid: LucidEvolution,
  nftUnit: string,
  lovelace: bigint = 2_000_000n,
): Promise<{ txHash: string; scriptAddress: string; outputIndex: number }> {
  const validator = getHololockerValidator();
  const scriptAddress = validatorToAddress("Custom", validator);

  const walletAddr = await lucid.wallet().address();
  const paymentCred = paymentCredentialOf(walletAddr);
  const lockDatum = makePkhLockDatum(paymentCred.hash);

  const tx = lucid
    .newTx()
    .pay.ToAddressWithData(scriptAddress, { kind: "inline", value: lockDatum }, { lovelace, [nftUnit]: 1n });

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
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
  await ensureSlotConfig(true);
  const validator = getHololockerValidator();
  const walletAddr = await lucid.wallet().address();
  const paymentCred = paymentCredentialOf(walletAddr);
  const slotConfig = SLOT_CONFIG_NETWORK["Custom"];

  const utxos = await lucid.utxosAt(scriptAddress);
  const lockUtxo = utxos.find((u) => u.txHash === lockTxHash && u.outputIndex === lockOutputIndex);
  if (!lockUtxo) throw new Error(`Lock UTXO not found: ${lockTxHash}#${lockOutputIndex}`);

  const now = Date.now();
  const validityUpperMs = now + 15_000;
  const validityUpperSlot = unixTimeToEnclosingSlot(validityUpperMs, slotConfig);
  const systemStartMs = getSystemStartMs();
  const upperPosix = systemStartMs + validityUpperSlot * 1000;
  const forHowLong = BigInt(upperPosix) + 5n;

  const unlockingDatum = makePkhUnlockingDatum(
    paymentCred.hash,
    lockTxHash,
    lockOutputIndex,
    forHowLong,
  );
  const redeemer = makeFullWithdrawRedeemer();

  // Pre-select wallet UTxOs to reduce CML WASM coin-selection pressure
  // (browser CML build has a known WASM memory bug during coin selection)
  const walletUtxos = await lucid.wallet().getUtxos();
  const adaOnly = walletUtxos
    .filter((u) => Object.keys(u.assets).length === 1 && u.assets.lovelace)
    .sort((a, b) => Number(b.assets.lovelace - a.assets.lovelace));
  const collateralUtxo = adaOnly[0];
  const feeUtxo = adaOnly.length > 1 ? adaOnly[1] : adaOnly[0];

  const tx = lucid
    .newTx()
    .collectFrom([lockUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddressWithData(scriptAddress, { kind: "inline", value: unlockingDatum }, lockUtxo.assets)
    .validTo(validityUpperMs)
    .addSigner(walletAddr);

  const signed = await (await tx.complete({
    localUPLCEval: false,
    setCollateral: 5_000_000n,
    presetWalletInputs: feeUtxo ? [feeUtxo] : undefined,
  })).sign.withWallet().complete();
  const txHash = await signed.submit();
  await lucid.awaitTx(txHash);

  const epochOffset = systemStartMs - slotConfig.zeroTime;
  const claimableAfterMs = Number(forHowLong) - epochOffset + 1000;
  return { txHash, forHowLong, claimableAfterMs };
}

export async function claimNftFromScript(
  lucid: LucidEvolution,
  scriptAddress: string,
  unlockTxHash: string,
  forHowLong: bigint,
): Promise<{ txHash: string }> {
  await ensureSlotConfig(true);
  const validator = getHololockerValidator();
  const walletAddr = await lucid.wallet().address();
  const slotConfig = SLOT_CONFIG_NETWORK["Custom"];

  const utxos = await lucid.utxosAt(scriptAddress);
  const unlockingUtxo = utxos.find((u) => u.txHash === unlockTxHash);
  if (!unlockingUtxo) throw new Error(`Unlocking UTXO not found: ${unlockTxHash}`);

  const redeemer = makeFullWithdrawRedeemer();

  const systemStartMs = getSystemStartMs();
  const epochOffset = systemStartMs - slotConfig.zeroTime;
  const validFromMs = Number(forHowLong) - epochOffset + 1000;

  const walletUtxos = await lucid.wallet().getUtxos();
  const adaOnly = walletUtxos
    .filter((u) => Object.keys(u.assets).length === 1 && u.assets.lovelace)
    .sort((a, b) => Number(b.assets.lovelace - a.assets.lovelace));
  const feeUtxo = adaOnly[0];

  const tx = lucid
    .newTx()
    .collectFrom([unlockingUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .validFrom(validFromMs)
    .addSigner(walletAddr);

  const signed = await (await tx.complete({
    localUPLCEval: false,
    setCollateral: 5_000_000n,
    presetWalletInputs: feeUtxo ? [feeUtxo] : undefined,
  })).sign.withWallet().complete();
  const txHash = await signed.submit();
  await lucid.awaitTx(txHash);

  return { txHash };
}
