import type { cardano } from '@utxorpc/spec';
import type { UtxorpcAddressPattern, UtxorpcAssetPattern, UtxorpcTxOutputPattern, UtxorpcTxPattern, UtxorpcTxPredicate } from "@effectstream/config";
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
  if (predicate.allOf && !predicate.allOf.every(p => matchesPredicate(tx, p))) {
    return false;
  }
  if (predicate.anyOf && !predicate.anyOf.some(p => matchesPredicate(tx, p))) {
    return false;
  }
  return true;
}

function matchesPattern(tx: cardano.Tx, pattern: UtxorpcTxPattern): boolean {
  const outputs = tx.outputs;
  const inputs = tx.inputs.map(input => input.asOutput!).filter(x => x);
  const matchConsumes = !pattern.consumes || matchesOutputPattern(outputs, pattern.consumes);
  const matchProduces = !pattern.produces || matchesOutputPattern(inputs, pattern.produces);
  const matchHasAddress = !pattern.hasAddress || matchesAddress(outputs, pattern.hasAddress) || matchesAddress(inputs, pattern.hasAddress);
  const matchMovesAsset = !pattern.movesAsset || matchesAsset(inputs, pattern.movesAsset);
  const matchMintsAsset = !pattern.mintsAsset || matchesAsset(outputs, pattern.mintsAsset);
  return matchConsumes && matchProduces && matchHasAddress && matchMovesAsset && matchMintsAsset;
}

function matchesOutputPattern(outputs: cardano.TxOutput[], pattern: UtxorpcTxOutputPattern): boolean {
  const matchAddress = !pattern.address || matchesAddress(outputs, pattern.address);
  const matchAsset = !pattern.asset || matchesAsset(outputs, pattern.asset);
  return matchAddress && matchAsset;
}

function matchesAddress(outputs: cardano.TxOutput[], pattern: UtxorpcAddressPattern): boolean {
  if (pattern.exactAddress) {
    const address = hexStringToUint8Array(pattern.exactAddress);
    if (!outputs.some(o => hashEqual(o.address, address))) {
      return false;
    }
  }
  if (pattern.paymentPart || pattern.delegationPart) {
    const addresses = outputs.map(o => Cardano.Address.fromBytes(HexBlob.fromBytes(o.address)));
    if (pattern.paymentPart && !addresses.some(a => a.getProps()?.paymentPart?.hash === pattern.paymentPart)) {
      return false;
    }
    if (pattern.delegationPart && !addresses.some(a => a.getProps()?.delegationPart?.hash === pattern.delegationPart)) {
      return false;
    }
  }
  return true;
}

function matchesAsset(outputs: cardano.TxOutput[], pattern: UtxorpcAssetPattern): boolean {
  const policyId = pattern.policyId ? hexStringToUint8Array(pattern.policyId) : null;
  const assetName = pattern.assetName ? hexStringToUint8Array(pattern.assetName) : null;
  return outputs.some(o => o.assets.some(ma => {
    if (policyId && !hashEqual(policyId, ma.policyId)) {
      return false;
    }
    return ma.assets.some(a => !assetName || hashEqual(a.name, assetName));
  }));
}