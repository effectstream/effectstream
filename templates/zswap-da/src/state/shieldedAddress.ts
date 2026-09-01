// Display-only formatting of the shielded identity.
//
// The two Midnight wallets hand the shielded identity over in different shapes:
//
//   - Lace (injected) already returns the canonical bech32m address from
//     `getShieldedAddresses()` — `mn_shield-addr_<network>1…`.
//   - The built-in JS wallet returns the raw hex COIN PUBLIC KEY, because that
//     is what shielded-output builders consume: @effectstream/wallets'
//     `midnight/local.ts` sets `shieldedAddress = address.coinPublicKeyString()`
//     and exposes the encryption key next to it as `shieldedEncryptionPublicKey`.
//
// A Midnight shielded address is bech32m(coin public key ++ encryption public
// key), so for the local wallet we recompose the two halves here. This is a
// DISPLAY concern only — the raw hex stays untouched in wallet state, because
// Faucet's `toAddr`, the mint/output builders and the offer-sender matching all
// consume the current encodings.

import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnightntwrk/wallet-sdk-address-format';

/** Both halves of a shielded address are exactly 32 bytes. */
const HEX_32_BYTES = /^(?:0x)?[0-9a-fA-F]{64}$/;

const stripHexPrefix = (h: string): string => (h.startsWith('0x') ? h.slice(2) : h);

/**
 * Canonical `mn_shield-addr_<network>1…` for display, or the input unchanged
 * when it cannot be derived.
 *
 * Pass-through cases, all deliberate:
 *  - anything already bech32m (`mn_…`) — the Lace address, and the
 *    `mn_addr_…` unshielded fallback the menu shows when there is no shielded
 *    address. Re-encoding either one would produce a wrong artifact.
 *  - a coin key that is not 32 bytes of hex, or a missing/short encryption key
 *    — the address is simply not derivable, so show what we have rather than
 *    crash or blank the row.
 *
 * The encryption-key length check is load-bearing, not belt-and-braces:
 * `ShieldedCoinPublicKey` validates its own 32-byte length, but
 * `ShieldedEncryptionPublicKey` does NOT — handed a short or non-hex string it
 * silently builds a truncated key, which then encodes into a plausible-looking
 * but wrong `mn_shield-addr_…`. Showing a wrong address is worse than showing
 * the hex.
 */
export function formatShieldedAddress(
  address: string | null | undefined,
  encryptionPublicKey: string | null | undefined,
  networkId: string,
): string {
  const addr = address ?? '';
  if (addr === '' || addr.startsWith('mn_')) return addr;
  if (!HEX_32_BYTES.test(addr)) return addr;

  const enc = encryptionPublicKey ?? '';
  if (!HEX_32_BYTES.test(enc)) return addr;

  try {
    return MidnightBech32m.encode(
      networkId,
      new ShieldedAddress(
        ShieldedCoinPublicKey.fromHexString(stripHexPrefix(addr)),
        ShieldedEncryptionPublicKey.fromHexString(stripHexPrefix(enc)),
      ),
    ).toString();
  } catch {
    // A display formatter must never take the wallet menu down with it.
    return addr;
  }
}
