// Midnight shielded wallet addresses (`mn_shield-addr[_<network>]1…`).
//
// A shielded address is bech32m over 64 bytes: the wallet's coin public key
// (32 bytes) followed by its encryption public key (32 bytes). Minting or
// paying a shielded coin to a wallet needs both: the coin is owned by the coin
// key, and its ciphertext is sealed to the encryption key so the wallet can
// find it. midnight-js refuses a recipient whose encryption key it cannot
// resolve, so a third-party mint passes the pair as
// `additionalCoinEncPublicKeyMappings` (the batcher's
// `coinEncPublicKeyMappings` input field).
//
// Decoding uses `@scure/base` with the bech32 length limit disabled: a
// shielded address is 124–135 characters, above bech32's legacy 90-character
// cap, which `MidnightBech32m.parse` may enforce depending on the resolved
// `@scure/base` (issue 00043).

import { bech32m } from "@scure/base";

const PREFIX = "mn";
const SHIELDED_ADDRESS_TYPE = "shield-addr";
const MAINNET = "mainnet";
const KEY_BYTES = 32;

export class ShieldedAddressError extends Error {
  override name = "ShieldedAddressError";
}

export interface ParsedShieldedAddress {
  /** Coin public key, 32 bytes as lowercase hex without `0x`. */
  coinPublicKey: string;
  /** Encryption public key, 32 bytes as lowercase hex without `0x`. */
  encryptionPublicKey: string;
  /** Network id from the prefix (`mainnet` when the prefix has no network segment). */
  networkId: string;
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string, what: string): Uint8Array => {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ShieldedAddressError(
      `${what} must be ${KEY_BYTES} bytes as 64 hex characters without 0x`,
    );
  }
  return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
};

/**
 * Decode a shielded address into its coin and encryption public keys.
 *
 * @param address `mn_shield-addr_<network>1…` (or `mn_shield-addr1…` on mainnet)
 * @param expectedNetworkId when given, the address must be for this network
 * @throws ShieldedAddressError for anything that is not a 64-byte shielded
 *   wallet address (bad checksum, another address kind, wrong network or length)
 */
export function parseShieldedAddress(
  address: string,
  expectedNetworkId?: string,
): ParsedShieldedAddress {
  let prefix: string;
  let bytes: Uint8Array;
  try {
    const decoded = bech32m.decode(address.trim() as `${string}1${string}`, false);
    prefix = decoded.prefix;
    bytes = bech32m.fromWords(decoded.words);
  } catch (error) {
    throw new ShieldedAddressError(
      `Not a bech32m Midnight address: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const [head, type, network = MAINNET, ...rest] = prefix.split("_");
  if (head !== PREFIX || type !== SHIELDED_ADDRESS_TYPE || rest.length > 0) {
    throw new ShieldedAddressError(
      `Not a shielded wallet address (prefix "${prefix}", expected "mn_shield-addr_<network>")`,
    );
  }
  if (expectedNetworkId !== undefined && network !== expectedNetworkId) {
    throw new ShieldedAddressError(
      `Shielded address is for network "${network}", expected "${expectedNetworkId}"`,
    );
  }
  if (bytes.length !== 2 * KEY_BYTES) {
    throw new ShieldedAddressError(
      `Shielded address payload is ${bytes.length} bytes, expected ${2 * KEY_BYTES} (coin key + encryption key)`,
    );
  }
  return {
    coinPublicKey: toHex(bytes.slice(0, KEY_BYTES)),
    encryptionPublicKey: toHex(bytes.slice(KEY_BYTES)),
    networkId: network,
  };
}

/** Encode a coin/encryption public key pair as a shielded address for `networkId`. */
export function formatShieldedAddress(
  keys: { coinPublicKey: string; encryptionPublicKey: string },
  networkId: string,
): string {
  const bytes = new Uint8Array(2 * KEY_BYTES);
  bytes.set(fromHex(keys.coinPublicKey, "coinPublicKey"), 0);
  bytes.set(fromHex(keys.encryptionPublicKey, "encryptionPublicKey"), KEY_BYTES);
  const prefix = networkId === MAINNET
    ? `${PREFIX}_${SHIELDED_ADDRESS_TYPE}`
    : `${PREFIX}_${SHIELDED_ADDRESS_TYPE}_${networkId}`;
  return bech32m.encode(prefix, bech32m.toWords(bytes), false);
}

/**
 * The `[coinPublicKeyHex, encryptionPublicKeyHex]` pair a third-party
 * shielded mint passes as `coinEncPublicKeyMappings` / midnight-js
 * `additionalCoinEncPublicKeyMappings`.
 */
export function shieldedAddressToCoinEncPublicKeyMapping(
  address: string,
  expectedNetworkId?: string,
): [string, string] {
  const { coinPublicKey, encryptionPublicKey } = parseShieldedAddress(
    address,
    expectedNetworkId,
  );
  return [coinPublicKey, encryptionPublicKey];
}
