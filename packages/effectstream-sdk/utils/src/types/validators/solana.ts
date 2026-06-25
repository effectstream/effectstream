import bs58 from "bs58";

const ADDRESS_BYTE_LENGTH = 32;

/**
 * Solana addresses are base58-encoded 32-byte Ed25519 public keys.
 * Example address: 11111111111111111111111111111111 (system program, all-zero key)
 * Example address: 5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM
 */
export function verifySolanaAddress(address: string): boolean {
  const decoded = bs58.decode(address);
  if (decoded.length !== ADDRESS_BYTE_LENGTH) {
    throw new Error(
      `Malformed Solana address: expected byte length ${ADDRESS_BYTE_LENGTH}, got ${decoded.length}`,
    );
  }
  return true;
}
