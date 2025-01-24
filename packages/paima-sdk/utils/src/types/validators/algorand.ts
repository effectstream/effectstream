import base32 from "hi-base32";
import sha512 from "js-sha512";
import { Base64 } from "js-base64";
import { CHECKSUM_ERROR_MSG, MALFORMED_ERROR_MSG } from "./utils.ts";

const BLOCK_HASH_BYTE_LENGTH = 32;
const TX_ID_BYTE_LENGTH = 32;
const ADDRESS_BYTE_LENGTH = 36;
const CHECKSUM_BYTE_LENGTH = 4;
const ADDRESS_LENGTH = 58;
const HASH_BYTES_LENGTH = 32;
const PUBLIC_KEY_LENGTH = 32;

const MALFORMED_BLOCK_HASH_ERROR_MSG = MALFORMED_ERROR_MSG("block hash");
const MALFORMED_TX_ID_ERROR_MSG = MALFORMED_ERROR_MSG("tx id");
const MALFORMED_ADDRESS_ERROR_MSG = MALFORMED_ERROR_MSG("address");
const CHECKSUM_ADDRESS_ERROR_MSG = CHECKSUM_ERROR_MSG("address");

function checksumFromPublicKey(pk: Uint8Array): Uint8Array {
  return Uint8Array.from(
    sha512.sha512_256.array(pk).slice(
      HASH_BYTES_LENGTH - CHECKSUM_BYTE_LENGTH,
      HASH_BYTES_LENGTH,
    ),
  );
}

/**
 * Taken from https://github.com/algorand/js-algorand-sdk/blob/6973ff583b243ddb0632e91f4c0383021430a789/src/encoding/address.ts#L88
 *
 * For regular addresses,
 *     base32 encoding of a 32-byte ed25519 public key and a 4-byte checksum (the last 4 bytes of the SHA-512/256 hash of the public key)
 * For multisig addresses,
 *     instead of a 32-byte public key, it’s the hash of some fields that specify the details of the multisig account.
 *     more specifically, it’s the SHA-512/256 hash of (a version byte, a threshold, and the public keys of all possible signers).
 *     The checksum is computed the same way as for regular addresses.
 *
 * Example address: JY2FRXQP7Q6SYH7QE2HF2XWNE644V6KUH3PYC4SYWPUSEATTDJSNUHMHR4
 */
export function verifyAlgorandAddress(address: string): boolean {
  if (typeof address !== "string") {
    throw new Error(
      `${MALFORMED_ADDRESS_ERROR_MSG}: expected string, got ${typeof address}, ${address}`,
    );
  }
  if (address.length !== ADDRESS_LENGTH) {
    throw new Error(
      `${MALFORMED_ADDRESS_ERROR_MSG}: expected length ${ADDRESS_LENGTH}, got ${address.length}: ${address}`,
    );
  }

  // try to decode
  const decoded = base32.decode.asBytes(address);
  // Sanity check
  if (decoded.length !== ADDRESS_BYTE_LENGTH) {
    throw new Error(
      `${MALFORMED_ADDRESS_ERROR_MSG}: expected byte length ${ADDRESS_BYTE_LENGTH}, got ${decoded.length}`,
    );
  }

  // Find publickey and checksum
  const pk = new Uint8Array(
    decoded.slice(0, ADDRESS_BYTE_LENGTH - CHECKSUM_BYTE_LENGTH),
  );
  const cs = new Uint8Array(
    decoded.slice(PUBLIC_KEY_LENGTH, ADDRESS_BYTE_LENGTH),
  );
  const checksum = checksumFromPublicKey(pk);
  // Check if the checksum and the address are equal
  if (!arrayEqual(checksum, cs)) throw new Error(CHECKSUM_ADDRESS_ERROR_MSG);

  return true;
}

/**
 * Note: strangely, there are 3 common ways to encode Algorand block hashes
 * 1. (rpc) base64
 * 2. (algokit json) blk-${base32} (stripping padding)
 * 3. (msgpck) base32 (unsure about padding)
 *
 * Example block hash: 3KYSrPgi16Cl3iLu3r+GaeZkBBrgNFbMB60jsrJtTdI=
 */
export function verifyAlgorandBlockHash(hash: string): boolean {
  // TODO: length check?
  const decoded = Base64.toUint8Array(
    "3KYSrPgi16Cl3iLu3r+GaeZkBBrgNFbMB60jsrJtTdI=",
  );
  // Sanity check
  if (decoded.length !== TX_ID_BYTE_LENGTH) {
    throw new Error(
      `${MALFORMED_TX_ID_ERROR_MSG}: expected byte length ${TX_ID_BYTE_LENGTH}, got ${decoded.length}`,
    );
  }
  return true;
}

/**
 * Taken from https://github.com/algorand/js-algorand-sdk/blob/6973ff583b243ddb0632e91f4c0383021430a789/src/transaction.ts#L1102
 *
 * base32 string encoding (stripping padding) of a "rawTxId" (SHA512/256 digest)
 *
 * Example tx hash: IJFAHCDFJ25GBPPNXXZ67KR2IQMZ5XGMAFWCKXIETKY6WV4OR6YQ
 */
export function verifyAlgorandTransactionHash(hash: string): boolean {
  const decoded = base32.decode.asBytes(hash);
  // Sanity check
  if (decoded.length !== BLOCK_HASH_BYTE_LENGTH) {
    throw new Error(
      `${MALFORMED_BLOCK_HASH_ERROR_MSG}: expected byte length ${MALFORMED_BLOCK_HASH_ERROR_MSG}, got ${decoded.length}`,
    );
  }
  return true;
}

function arrayEqual<T>(a: ArrayLike<T>, b: ArrayLike<T>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return Array.from(a).every((val, i) => val === b[i]);
}
