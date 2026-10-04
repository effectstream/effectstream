// VENDORED from acedward/passport @ 599327b918b55afc95d6c98a89bcd15f4e8b0d53
// (branch 00047-solana-ed25519-arm, PR #6), licensed under the Apache License, Version 2.0
// (the repository's LICENCE; http://www.apache.org/licenses/LICENSE-2.0). Changes: only the
// portable InboxEntry v1 codec is kept, unmodified:
//   - contract/src/wallet/entry-format.ts (sha256 464a3851a3bf8474aad15c51345cf55c4f8cdc4ba5ef5117ef5f80e3a3d0c7c1):
//     ENTRY_SIZE, ENTRY_VERSION, ENTRY_SUITE, PlainCoin;
//   - contract/src/wallet/deposit.ts (sha256 a3e982e3c9ff48e3793962e7925a04d53f348cfae883b7150c0304254db889dd):
//     sealEntryPortable, openEntryPortable, generateEncKeyPairPortable and their helpers;
//     depositAsThirdParty, inboxWalkPortable and the `Ledger` type import are left out.
// Passport's `inbox.ts` stays the reference codec: the delivery tests seal with each and open with
// the other (00058 P4 "Sealing").
//
// The 192-byte InboxEntry v1 of MIP-0012 §6.4, sealed to an account's public `enc_key` (X25519 +
// HKDF-SHA256 + AES-256-GCM), without node:crypto.

import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const ENTRY_SIZE = 192;
export const ENTRY_VERSION = 0x01;
export const ENTRY_SUITE = 0x01;

/** The 80-byte plaintext: coin nonce ‖ colour ‖ value (u128 big-endian). */
export interface PlainCoin {
  nonce: Uint8Array;
  color: Uint8Array;
  value: bigint;
}

const PLAINTEXT_SIZE = 80;
const HKDF_INFO = new TextEncoder().encode('midnight:custody:inbox:v1');
const NONCE_SIZE = 12;
const TAG_SIZE = 16;

const subtle = (): SubtleCrypto => {
  const c = (globalThis as any).crypto;
  if (!c?.subtle) throw new Error('WebCrypto is unavailable — the portable inbox codec needs crypto.subtle');
  return c.subtle as SubtleCrypto;
};

const randomBytes = (n: number): Uint8Array => {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
};

function aeadKeyMaterial(rawSecret: Uint8Array, rawPeerPublic: Uint8Array): Uint8Array {
  // HKDF-SHA256 with an EMPTY salt (RFC 5869's default) and L = 32 — the same
  // three inputs node:crypto's hkdfSync is given in inbox.ts.
  const shared = x25519.getSharedSecret(rawSecret, rawPeerPublic);
  return hkdf(sha256, shared, new Uint8Array(0), HKDF_INFO, 32);
}

async function aesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return subtle().importKey('raw', raw as unknown as BufferSource, 'AES-GCM', false, [usage]);
}

function encodeCoin(coin: PlainCoin): Uint8Array {
  const out = new Uint8Array(PLAINTEXT_SIZE);
  out.set(coin.nonce.subarray(0, 32), 0);
  out.set(coin.color.subarray(0, 32), 32);
  let v = coin.value;
  for (let i = 15; i >= 0; i--) {
    out[64 + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new RangeError('coin value does not fit the entry\'s 128-bit field');
  return out;
}

function decodeCoin(buf: Uint8Array): PlainCoin {
  let value = 0n;
  for (let i = 0; i < 16; i++) value = (value << 8n) | BigInt(buf[64 + i]!);
  return { nonce: buf.slice(0, 32), color: buf.slice(32, 64), value };
}

/**
 * Seal a coin description for `recipientEncKey` — the 192-byte InboxEntry v1 of
 * MIP-0012 §6.4, produced without `node:crypto`.
 *
 * Async because WebCrypto is; everything else about it is the reference codec.
 */
export async function sealEntryPortable(
  recipientEncKey: Uint8Array,
  coin: PlainCoin,
): Promise<Uint8Array> {
  if (recipientEncKey.length !== 32) {
    throw new RangeError(`an enc_key is 32 bytes, got ${recipientEncKey.length}`);
  }
  const ephSecret = x25519.utils.randomSecretKey();
  const ephPublic = x25519.getPublicKey(ephSecret);
  const key = await aesKey(aeadKeyMaterial(ephSecret, recipientEncKey), 'encrypt');
  const nonce = randomBytes(NONCE_SIZE);
  const ad = Uint8Array.from([ENTRY_VERSION, ENTRY_SUITE]);

  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: nonce as unknown as BufferSource, additionalData: ad as unknown as BufferSource, tagLength: TAG_SIZE * 8 },
      key,
      encodeCoin(coin) as unknown as BufferSource,
    ),
  );
  // WebCrypto returns ciphertext‖tag; the container stores them apart.
  const ct = sealed.subarray(0, PLAINTEXT_SIZE);
  const tag = sealed.subarray(PLAINTEXT_SIZE);

  const entry = new Uint8Array(ENTRY_SIZE); // trailing padding stays zero (§6.4 MUST)
  entry[0] = ENTRY_VERSION;
  entry[1] = ENTRY_SUITE;
  entry.set(ephPublic, 2);
  entry.set(nonce, 34);
  entry.set(tag, 46);
  entry.set(ct, 62);
  return entry;
}

/**
 * Open an entry with the account encryption secret. Returns null — never an
 * error — for an entry the walk must skip: wrong length, unknown version or
 * suite, or failed authentication (§6.5, and S3's poisoned entries).
 */
export async function openEntryPortable(
  encSecretKey: Uint8Array,
  entry: Uint8Array,
): Promise<PlainCoin | null> {
  if (entry.length !== ENTRY_SIZE) return null;
  if (entry[0] !== ENTRY_VERSION || entry[1] !== ENTRY_SUITE) return null;
  try {
    const ephPublic = entry.slice(2, 34);
    const nonce = entry.slice(34, 46);
    const tag = entry.slice(46, 62);
    const ct = entry.slice(62, 62 + PLAINTEXT_SIZE);
    const key = await aesKey(aeadKeyMaterial(encSecretKey, ephPublic), 'decrypt');
    const sealed = new Uint8Array(PLAINTEXT_SIZE + TAG_SIZE);
    sealed.set(ct, 0);
    sealed.set(tag, PLAINTEXT_SIZE);
    const pt = new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: nonce as unknown as BufferSource, additionalData: Uint8Array.from([entry[0]!, entry[1]!]) as unknown as BufferSource, tagLength: TAG_SIZE * 8 },
        key,
        sealed as unknown as BufferSource,
      ),
    );
    return decodeCoin(pt);
  } catch {
    return null;
  }
}

/** An X25519 keypair in the raw form the contract and the entries use. Same
 *  shape as `inbox.ts`'s `generateEncKeyPair`, without `node:crypto`. */
export function generateEncKeyPairPortable(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const secretKey = x25519.utils.randomSecretKey();
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}
