import bs58check from "bs58check";
import { MALFORMED_ERROR_MSG } from "./utils.ts";

const BLOCK_HASH_BYTE_LENGTH = 34;
const TX_ID_BYTE_LENGTH = 34;
const ADDRESS_BYTE_LENGTH = 36;

const MALFORMED_BLOCK_HASH_ERROR_MSG = MALFORMED_ERROR_MSG("block hash");
const MALFORMED_TX_ID_ERROR_MSG = MALFORMED_ERROR_MSG("tx id");
const MALFORMED_ADDRESS_ERROR_MSG = MALFORMED_ERROR_MSG("address");

/**
 * Example address: B62qpLST3UC1rpVT6SHfB7wqW2iQgiopFAGfrcovPgLjgfpDUN2LLeg
 */
export function verifyMinaAddress(address: string): boolean {
  const decoded = bs58check.decode(address);
  // Sanity check
  if (decoded.length !== ADDRESS_BYTE_LENGTH) {
    throw new Error(
      `${MALFORMED_ADDRESS_ERROR_MSG}: expected byte length ${ADDRESS_BYTE_LENGTH}, got ${decoded.length}`,
    );
  }
  return true;
}

/**
 * Example block hash: 3NK9ToRM1gnzyDbafWzdde7EYemjUN2cb5isjtchcCuupty2MgbC
 */
export function verifyMinaBlockHash(hash: string): boolean {
  const decoded = bs58check.decode(hash);
  // Sanity check
  if (decoded.length !== TX_ID_BYTE_LENGTH) {
    throw new Error(
      `${MALFORMED_BLOCK_HASH_ERROR_MSG}: expected byte length ${BLOCK_HASH_BYTE_LENGTH}, got ${decoded.length}`,
    );
  }
  return true;
}

/**
 * See https://github.com/openmina/openmina/blob/26354df0b4165a82ba67fa9ab1f2301841f7b033/mina-p2p-messages/src/v2/hashing.rs#L89-L92
 *
 * Example tx hash: 5JuYVpv6njuwUjgf8WLfXhTEJGHck1pwJXt92Lpcskiwu8kBL632
 */
export function verifyMinaTransactionHash(hash: string): boolean {
  const decoded = bs58check.decode(hash);
  // Sanity check
  if (decoded.length !== TX_ID_BYTE_LENGTH) {
    throw new Error(
      `${MALFORMED_TX_ID_ERROR_MSG}: expected byte length ${TX_ID_BYTE_LENGTH}, got ${decoded.length}`,
    );
  }
  return true;
}
