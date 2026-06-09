import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";
import { buyItemsGrammar, referrerRewardGrammar } from "./primitives.ts";

/**
 * Admin/config commands submitted on-chain via the EffectstreamL2 contract.
 *
 * These are the deterministic config-write path: an admin calls
 * `effectstreamSubmitGameInput(["create-campaign", id, configJson])` on the L2 contract,
 * the builtin `EVM:EffectstreamL2` primitive ingests the event, and the STM (authorized by
 * checking the on-chain signer) writes the `offchain_*` config tables. Complex payloads are
 * carried as JSON strings (same convention as buy-items stringifying its item arrays).
 */
export const adminGrammar = {
  "create-campaign": [
    ["campaignId", Type.String()],
    ["configJson", Type.String()],
  ],
  "set-product": [
    ["campaignId", Type.String()],
    ["productJson", Type.String()],
  ],
  "end-campaign": [
    ["campaignId", Type.String()],
  ],
  "set-coin": [
    ["coinJson", Type.String()],
  ],
  // Post-sale: enqueue NFT mints for every item each buyer owns. Campaign must be ended.
  "mint-nfts": [
    ["campaignId", Type.String()],
  ],
} as const satisfies GrammarDefinition;

/**
 * The generic UTxORPC primitive forwards the raw protobuf transaction as `{ hash, bytes }`;
 * the STM deserializes `bytes` itself (see decode-utxorpc-tx.ts). This replaces the builtin
 * Cardano:Transfer grammar so we can ingest on-chain-validated purchase receipts.
 */
export const utxorpcGenericGrammar = [
  ["hash", Type.String()],
  ["bytes", Type.String()],
] as const;

export const grammar = {
  "buy-items": buyItemsGrammar,
  "referrer-reward": referrerRewardGrammar,
  "cardano-payment": utxorpcGenericGrammar,
  ...adminGrammar,
} as const satisfies GrammarDefinition;
