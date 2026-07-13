/**
 * Vendored from zswap-offerfile-kernel/packages/mip5-offer-files (MIP-0005).
 * HRP: swapoffer — standard 90-char bech32 cap lifted.
 */

import { bech32m } from '@scure/base';
import { Transaction } from '@midnight-ntwrk/ledger-v8';

export const OFFER_HRP = 'swapoffer';

const NO_LIMIT = false as unknown as number;

export function encodeOffer(transactionBytes: Uint8Array): string {
  if (!(transactionBytes instanceof Uint8Array)) {
    throw new TypeError('encodeOffer: transactionBytes must be a Uint8Array');
  }
  const words = bech32m.toWords(transactionBytes);
  return bech32m.encode(OFFER_HRP, words, NO_LIMIT);
}

export function decodeOffer(encoded: string): Uint8Array {
  if (typeof encoded !== 'string') {
    throw new TypeError('decodeOffer: input must be a string');
  }
  const { prefix, words } = bech32m.decode(
    encoded as `${string}1${string}`,
    NO_LIMIT,
  );
  if (prefix !== OFFER_HRP) {
    throw new Error(`decodeOffer: expected HRP "${OFFER_HRP}", got "${prefix}"`);
  }
  return Uint8Array.from(bech32m.fromWords(words));
}

export function offerToBech32(tx: { serialize(): Uint8Array }): string {
  return encodeOffer(tx.serialize());
}

export function offerFromBech32(text: string) {
  return Transaction.deserialize('signature', 'proof', 'binding', decodeOffer(text));
}
