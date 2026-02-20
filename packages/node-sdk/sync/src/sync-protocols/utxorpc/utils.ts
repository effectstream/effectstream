import type { cardano } from '@utxorpc/spec';
import type { UtxorpcAddressPattern, UtxorpcAnyChainTxPattern, UtxorpcAssetPattern, UtxorpcTxOutputPattern, UtxorpcTxPredicate } from "@effectstream/config";
import { hexStringToUint8Array } from "@effectstream/utils";
import { Cardano } from '@cardano-sdk/core';
import { HexBlob } from '@cardano-sdk/util';

export function hashEqual(lhs: Uint8Array, rhs: Uint8Array): boolean {
  if (lhs.length !== rhs.length) {
    return false;
  }
  for (let i = 0; i < lhs.length; ++i) {
    if (lhs[i] !== rhs[i]) {
      return false;
    }
  }
  return true;
}

export function matchesPredicate(tx: cardano.Tx, predicate: UtxorpcTxPredicate): boolean {
  if (predicate.match && !matchesPattern(tx, predicate.match)) {
    return false;
  }
  if (predicate.not && predicate.not.some(p => matchesPredicate(tx, p))) {
    return false;
  }
  if (predicate.all_of && !predicate.all_of.every(p => matchesPredicate(tx, p))) {
    return false;
  }
  if (predicate.any_of && !predicate.any_of.some(p => matchesPredicate(tx, p))) {
    return false;
  }
  return true;
}

function matchesPattern(tx: cardano.Tx, pattern: UtxorpcAnyChainTxPattern): boolean {
  const cardanoPattern = pattern.cardano;
  if (!cardanoPattern) return false;
  const outputs = tx.outputs;
  const inputs = tx.inputs.map(input => input.asOutput!).filter(x => x);
  const matchHasAddress = !cardanoPattern.has_address || matchesAddress(outputs, cardanoPattern.has_address) || matchesAddress(inputs, cardanoPattern.has_address);
  const matchMovesAsset = !cardanoPattern.moves_asset || matchesAsset(inputs, cardanoPattern.moves_asset);
  const matchMintsAsset = !cardanoPattern.mints_asset || matchesAsset(outputs, cardanoPattern.mints_asset);
  return matchHasAddress && matchMovesAsset && matchMintsAsset;
}

function matchesOutputPattern(outputs: cardano.TxOutput[], pattern: UtxorpcTxOutputPattern): boolean {
  const matchAddress = !pattern.address || matchesAddress(outputs, pattern.address);
  const matchAsset = !pattern.asset || matchesAsset(outputs, pattern.asset);
  return matchAddress && matchAsset;
}

function matchesAddress(outputs: cardano.TxOutput[], pattern: UtxorpcAddressPattern): boolean {
  if (pattern.exact_address) {
    const address = hexStringToUint8Array(pattern.exact_address);
    if (!outputs.some(o => hashEqual(o.address, address))) {
      return false;
    }
  }
  if (pattern.payment_part || pattern.delegation_part) {
    const addresses = outputs.map(o => Cardano.Address.fromBytes(HexBlob.fromBytes(o.address)));
    if (pattern.payment_part && !addresses.some(a => a.getProps()?.paymentPart?.hash === pattern.payment_part)) {
      return false;
    }
    if (pattern.delegation_part && !addresses.some(a => a.getProps()?.delegationPart?.hash === pattern.delegation_part)) {
      return false;
    }
  }
  return true;
}

function matchesAsset(outputs: cardano.TxOutput[], pattern: UtxorpcAssetPattern): boolean {
  const policyId = pattern.policy_id ? hexStringToUint8Array(pattern.policy_id) : null;
  const assetName = pattern.asset_name ? hexStringToUint8Array(pattern.asset_name) : null;
  return outputs.some(o => o.assets.some(ma => {
    if (policyId && !hashEqual(policyId, ma.policyId)) {
      return false;
    }
    return ma.assets.some(a => !assetName || hashEqual(a.name, assetName));
  }));
}