import { describe, expect, test } from 'bun:test';
import { bech32m } from '@scure/base';
import { ShieldedAddress } from '@midnightntwrk/wallet-sdk-address-format';
import { formatShieldedAddress } from './shieldedAddress';

// 32 bytes each — the shapes @effectstream/wallets' local connector exposes as
// `shieldedAddress` (hex coin public key) and `shieldedEncryptionPublicKey`.
const COIN = 'ab7931b72a4f1c8d3e5b9076a1c2d4e6f80915273849506172839405060df090';
const ENC = '5c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9012a3b4c5d6';

/**
 * Decode a shielded address back to its two key halves.
 *
 * NOT `MidnightBech32m.parse`: at the pinned wallet-sdk-address-format 3.1.2
 * (and still at 4.0.0-beta.2) `asString()` encodes with the bech32m length
 * limit disabled while `parse()` decodes with the default 90-character cap
 * still on — so the library cannot read back its own 124–135 character
 * shielded addresses. `@scure/base` is a direct dependency of this template,
 * so we drive the same codec through it with the limit off.
 * See issues/00043 in the organizer workspace.
 */
function decodeShieldedAddress(encoded: string): ShieldedAddress {
  const { bytes } = bech32m.decodeToBytes(encoded, false);
  return ShieldedAddress.codec.dataFromBytes(Buffer.from(bytes));
}

describe('formatShieldedAddress — local wallet (hex → bech32m)', () => {
  test('composes a canonical undeployed shielded address', () => {
    const out = formatShieldedAddress(COIN, ENC, 'undeployed');
    expect(out.startsWith('mn_shield-addr_undeployed1')).toBe(true);
  });

  test('round-trips: the encoded address carries both original keys (SC-002)', () => {
    const out = formatShieldedAddress(COIN, ENC, 'undeployed');
    const back = decodeShieldedAddress(out);
    expect(back.coinPublicKeyString()).toBe(COIN);
    expect(back.encryptionPublicKeyString()).toBe(ENC);
  });

  test('network prefix follows the configured network id, not a hardcode (FR-005)', () => {
    expect(formatShieldedAddress(COIN, ENC, 'testnet').startsWith('mn_shield-addr_testnet1')).toBe(true);
    // 'mainnet' is the one network whose segment is omitted, by library design.
    expect(formatShieldedAddress(COIN, ENC, 'mainnet').startsWith('mn_shield-addr1')).toBe(true);
  });

  test('accepts 0x-prefixed hex', () => {
    const out = formatShieldedAddress(`0x${COIN}`, `0x${ENC}`, 'undeployed');
    expect(decodeShieldedAddress(out).coinPublicKeyString()).toBe(COIN);
  });

  test('is case-insensitive about the input hex', () => {
    const out = formatShieldedAddress(COIN.toUpperCase(), ENC.toUpperCase(), 'undeployed');
    expect(decodeShieldedAddress(out).coinPublicKeyString()).toBe(COIN);
  });
});

describe('formatShieldedAddress — pass-through (FR-004)', () => {
  test('an already-bech32m Lace address is returned verbatim, never re-encoded', () => {
    const lace = formatShieldedAddress(COIN, ENC, 'undeployed');
    expect(formatShieldedAddress(lace, ENC, 'undeployed')).toBe(lace);
  });

  test('an unshielded mn_addr_ fallback is left alone', () => {
    const unshielded = 'mn_addr_undeployed14dunrde2fuwg60jmjpm2rsk5umuqj9f88py4qctjsw2q2psd7zgqqtsnha';
    expect(formatShieldedAddress(unshielded, ENC, 'undeployed')).toBe(unshielded);
  });

  test('missing encryption key → the raw coin key, unchanged', () => {
    expect(formatShieldedAddress(COIN, null, 'undeployed')).toBe(COIN);
    expect(formatShieldedAddress(COIN, undefined, 'undeployed')).toBe(COIN);
    expect(formatShieldedAddress(COIN, '', 'undeployed')).toBe(COIN);
  });

  test('a short encryption key does NOT produce a plausible-but-wrong address', () => {
    // ShieldedEncryptionPublicKey has no length check of its own, so without
    // our guard this would encode into a valid-looking mn_shield-addr_… that
    // nobody can receive at.
    const out = formatShieldedAddress(COIN, 'deadbeef', 'undeployed');
    expect(out).toBe(COIN);
    expect(out.startsWith('mn_')).toBe(false);
  });

  test('garbage input is returned unchanged and never throws', () => {
    expect(formatShieldedAddress('not-an-address', ENC, 'undeployed')).toBe('not-an-address');
    expect(formatShieldedAddress('zz'.repeat(32), ENC, 'undeployed')).toBe('zz'.repeat(32));
    expect(formatShieldedAddress(COIN.slice(0, 40), ENC, 'undeployed')).toBe(COIN.slice(0, 40));
  });

  test('null/empty address (wallet still syncing) → empty string, no crash', () => {
    expect(formatShieldedAddress(null, ENC, 'undeployed')).toBe('');
    expect(formatShieldedAddress(undefined, null, 'undeployed')).toBe('');
    expect(formatShieldedAddress('', '', 'undeployed')).toBe('');
  });
});
