// Build a maker's bech32m offer blob via the connected browser wallet
// (ConnectedAPI / Lace). Extracted from the old frontend's SwapInterface:
// makeIntent(payFees:false) → serialize → encodeOffer. The offer is
// intentionally imbalanced (gives ≠ wants); the taker's wallet balances + the
// batcher pays fees, so the maker commits no Dust.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { encodeOffer } from 'mip-zswap-offer';

export interface OfferLeg {
  kind: 'shielded' | 'unshielded';
  color: string;
  amount: bigint;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
// makeIntent returns an opaque serialized tx; Lace/midnight-js use hex, fall
// back to base64 if it doesn't look like hex.
function decodeConnectorTx(tx: string): Uint8Array {
  const isHex = /^(0x)?[0-9a-fA-F]+$/.test(tx) && tx.replace(/^0x/, '').length % 2 === 0;
  return isHex ? hexToBytes(tx) : base64ToBytes(tx);
}

// Lace's balanceSealedTransaction lands its balancing Intent at segment 1, and
// 'random' often collides there. Pick a wide-range id ≥ 2 to avoid the reserved
// slots (0 = guaranteed offer, 1 = Lace's balancing slot).
function pickMakerIntentId(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.max(2, buf[0]! & 0x7fffffff);
}

export async function buildMakerOfferBlob(
  connectedApi: ConnectedAPI,
  networkId: string,
  gives: OfferLeg[],
  wants: OfferLeg[],
): Promise<string> {
  if (typeof (connectedApi as any).makeIntent !== 'function') {
    throw new Error('This wallet does not support makeIntent — update Lace to a version with the Midnight swap-intent API.');
  }
  const { shieldedAddress } = await connectedApi.getShieldedAddresses();
  const { unshieldedAddress } = await connectedApi.getUnshieldedAddress();

  const inputs = gives.map((g) => ({ kind: g.kind, type: g.color, value: g.amount }));
  const outputs = wants.map((w) => ({
    kind: w.kind,
    type: w.color,
    value: w.amount,
    recipient: w.kind === 'shielded' ? shieldedAddress : unshieldedAddress,
  }));

  const intentId = pickMakerIntentId();
  // payFees:false — a maker offer is intentionally imbalanced; the taker pays.
  const { tx } = await connectedApi.makeIntent(inputs as any, outputs as any, {
    intentId,
    payFees: false,
  } as any);

  const bytes = decodeConnectorTx(tx);
  setNetworkId(networkId as NetworkId);
  // gives/wants are recovered from tx.imbalances() at index time.
  return encodeOffer(bytes);
}
