// Best-effort identification of an offer's maker from the serialized
// transaction alone, so the UI can label offers as "by <selfName>" vs
// "by <otherName>".
//
// We can only recover the maker's identity from unshielded inputs/outputs:
// - UtxoSpend.owner exposes the maker's SignatureVerifyingKey (their public
//   signing key) for any unshielded input they spend.
// - UtxoOutput.owner exposes a UserAddress for any unshielded output (the
//   maker routes their wants back to themselves, so this is them).
//
// Shielded-only offers stay anonymous on purpose — coin commitments hide
// the recipient's coin public key, and only the holding wallet can decrypt
// the ciphertext. For those we return undefined and the caller falls back
// to a neutral label.

import { Transaction as LedgerV8Transaction } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  MidnightBech32m,
  UnshieldedAddress,
} from '@midnightntwrk/wallet-sdk-address-format';
import { OfferFiles } from '@effectstream/mip-zswap-offer/mip5';

export interface OfferSenderInfo {
  // Lowercased hex string suitable for direct equality compare. Either:
  //  - a UserAddress (32-byte unshielded address) extracted from an output, OR
  //  - a SignatureVerifyingKey (32 bytes) extracted from an unshielded input.
  // We store both kinds in the same field because the `equals(...)` we do is
  // simple string compare against whichever representation we also derive
  // from the connected wallet.
  unshieldedOwners: string[];
}

function normalizeHex(s: string): string {
  return (s.startsWith('0x') ? s.slice(2) : s).toLowerCase();
}

export function parseOfferSender(offerBech32m: string, networkId: NetworkId): OfferSenderInfo | undefined {
  setNetworkId(networkId);
  let tx: any;
  try {
    const bytes = OfferFiles.decode(offerBech32m);
    tx = LedgerV8Transaction.deserialize('signature', 'proof', 'binding', bytes);
  } catch {
    return undefined;
  }

  const owners = new Set<string>();
  const intents = tx.intents as Map<number, any> | undefined;
  if (!intents) return undefined;

  for (const intent of intents.values()) {
    const offers = [intent?.guaranteedUnshieldedOffer, intent?.fallibleUnshieldedOffer];
    for (const off of offers) {
      if (!off) continue;
      for (const o of off.outputs ?? []) {
        if (typeof o?.owner === 'string') owners.add(normalizeHex(o.owner));
      }
      for (const i of off.inputs ?? []) {
        if (typeof i?.owner === 'string') owners.add(normalizeHex(i.owner));
      }
    }
  }

  if (owners.size === 0) return undefined;
  return { unshieldedOwners: Array.from(owners) };
}

// Convert a Lace bech32m unshielded address to the same lowercased hex form
// used in `OfferSenderInfo.unshieldedOwners`.
export function unshieldedAddressToHex(unshieldedBech32m: string, networkId: NetworkId): string | undefined {
  try {
    const parsed = MidnightBech32m.parse(unshieldedBech32m).decode(UnshieldedAddress, networkId);
    return normalizeHex(parsed.hexString);
  } catch {
    return undefined;
  }
}

export function isOwnOffer(info: OfferSenderInfo | undefined, selfHex: string | undefined): boolean {
  if (!info || !selfHex) return false;
  return info.unshieldedOwners.includes(selfHex.toLowerCase());
}
