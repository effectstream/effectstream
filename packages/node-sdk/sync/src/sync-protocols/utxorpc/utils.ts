import type { cardano } from '@utxorpc/spec';
import type { UtxorpcAddressPattern, UtxorpcAnyChainTxPattern, UtxorpcAssetPattern, UtxorpcCertificatePattern, UtxorpcTxOutputPattern, UtxorpcTxPredicate } from "@effectstream/config";
import { hexStringToUint8Array } from "@effectstream/utils";
import { Cardano } from '@cardano-sdk/core';
import { HexBlob } from '@cardano-sdk/util';
import type { CardanoTxPredicate as TxPredicate } from "@utxorpc/sdk";
import stableStringify from "json-stable-stringify";

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
  const matchMovesAsset = !cardanoPattern.moves_asset || matchesAsset(outputs, cardanoPattern.moves_asset) || matchesAsset(inputs, cardanoPattern.moves_asset);
  const matchMintsAsset = !cardanoPattern.mints_asset || matchesAsset(outputs, cardanoPattern.mints_asset);
  const matchHasCertificate = !cardanoPattern.has_certificate || tx.certificates.length > 0;
  return matchHasAddress && matchMovesAsset && matchMintsAsset && matchHasCertificate;
}

function matchesOutputPattern(outputs: cardano.TxOutput[], pattern: UtxorpcTxOutputPattern): boolean {
  const matchAddress = !pattern.address || matchesAddress(outputs, pattern.address);
  const matchAsset = !pattern.asset || matchesAsset(outputs, pattern.asset);
  return matchAddress && matchAsset;
}

function matchesAddress(outputs: cardano.TxOutput[], pattern: UtxorpcAddressPattern): boolean {
  if (pattern.exact_address) {
    const address = Uint8Array.from(atob(pattern.exact_address), c => c.charCodeAt(0));
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

// =============================================
// Config → SDK predicate conversion
// =============================================

function convertAddressPattern(pattern: UtxorpcAddressPattern): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  if (pattern.exact_address) {
    result.exactAddress = Uint8Array.from(atob(pattern.exact_address), c => c.charCodeAt(0));
  }
  if (pattern.payment_part) {
    result.paymentPart = hexStringToUint8Array(pattern.payment_part);
  }
  if (pattern.delegation_part) {
    result.delegationPart = hexStringToUint8Array(pattern.delegation_part);
  }
  return result;
}

function convertAssetPattern(pattern: UtxorpcAssetPattern): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  if (pattern.policy_id) {
    result.policyId = hexStringToUint8Array(pattern.policy_id);
  }
  if (pattern.asset_name) {
    result.assetName = hexStringToUint8Array(pattern.asset_name);
  }
  return result;
}

function convertCertificatePattern(pattern: boolean | UtxorpcCertificatePattern): Record<string, unknown> {
  if (typeof pattern === "boolean") return {};
  if (pattern.stake_delegation) {
    const value: Record<string, unknown> = {};
    if (pattern.stake_delegation.pool_keyhash) {
      value.poolKeyhash = hexStringToUint8Array(pattern.stake_delegation.pool_keyhash);
    }
    return { certificateType: { case: "stakeDelegation", value } };
  }
  if (pattern.any_pool_keyhash) {
    return { certificateType: { case: "anyPoolKeyhash", value: hexStringToUint8Array(pattern.any_pool_keyhash) } };
  }
  return {};
}

/**
 * Convert a config-layer UtxorpcTxPredicate (snake_case) to the SDK's TxPredicate (camelCase).
 */
export function configPredicateToSdkPredicate(config: UtxorpcTxPredicate): TxPredicate {
  const result: TxPredicate = {};

  if (config.match?.cardano) {
    const c = config.match.cardano;
    const match: Record<string, unknown> = {};
    if (c.has_address) match.hasAddress = convertAddressPattern(c.has_address);
    if (c.moves_asset) match.movesAsset = convertAssetPattern(c.moves_asset);
    if (c.mints_asset) match.mintsAsset = convertAssetPattern(c.mints_asset);
    if (c.has_certificate) match.hasCertificate = convertCertificatePattern(c.has_certificate);
    result.match = match as TxPredicate["match"];
  }

  if (config.not) result.not = config.not.map(configPredicateToSdkPredicate);
  if (config.all_of) result.allOf = config.all_of.map(configPredicateToSdkPredicate);
  if (config.any_of) result.anyOf = config.any_of.map(configPredicateToSdkPredicate);

  return result;
}

/**
 * Deterministic string key for a predicate, used to deduplicate watchers.
 * Predicates that produce the same key share a single WatchClient stream.
 */
export function predicateKey(predicate: UtxorpcTxPredicate): string {
  return stableStringify(predicate) ?? "{}";
}

/**
 * Returns true if this predicate can be effectively filtered server-side.
 */
export function isEffectiveServerPredicate(predicate: UtxorpcTxPredicate): boolean {
  if (!predicate.match?.cardano) return false;
  const c = predicate.match.cardano;
  return !!(c.has_address || c.moves_asset || c.mints_asset || c.has_certificate);
}