// The operator's Solana Ed25519 signature that authorizes `mintFromSolana`.
//
// The signed message is `"SMBRDG1:" ‖ mintDigest(bridge, networkTag, lockNonce,
// recipient, amount)` (40 bytes). The digest is computed by the contract's own
// exported pure circuit `mintDigest` — never re-declared in TypeScript — so the
// relayer and the circuit can never disagree about the bytes.
//
// Off-chain recipe (00050 P0 S1, Night Market's ed25519 arm):
//   - the operator key is the Solana keypair (tweetnacl secretKey = seed ‖ pubkey);
//   - `nacl.sign.detached(msg, secretKey)`, pre-checked with `nacl.sign.detached.verify`;
//   - the circuit takes `{r: Curve25519Point, s: Curve25519Scalar}`: R decoded
//     strictly (prime-order point, so never the identity) and s < L.
//
// Nothing here logs key material.
import nacl from "tweetnacl";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  curve25519FromProjective,
  isValidCurve25519Point,
} from "@midnight-ntwrk/compact-runtime-0.20";
import { bridgePureCircuits } from "./contract.ts";

/** "SMBRDG1:" — the domain prefix of every mint message (8 bytes). */
export const MINT_MESSAGE_PREFIX = new TextEncoder().encode("SMBRDG1:");
export const MINT_MESSAGE_LEN = 40;
/** Ed25519 group order L. */
export const ED25519_L: bigint = ed25519.Point.Fn.ORDER;

export type Curve25519Point = { x: bigint; y: bigint };
export type Ed25519SignatureArg = { r: Curve25519Point; s: bigint };
/** Compact `Either<ZswapCoinPublicKey, ContractAddress>`. */
export type MintRecipient = {
  is_left: boolean;
  left: { bytes: Uint8Array };
  right: { bytes: Uint8Array };
};

export function hexToBytes(hex: string, expectedLen?: number, what = "hex"): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new Error(`${what} is not hex`);
  const out = Uint8Array.from(Buffer.from(h, "hex"));
  if (expectedLen !== undefined && out.length !== expectedLen) {
    throw new Error(`${what} must be ${expectedLen} bytes, got ${out.length}`);
  }
  return out;
}
export const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

/** A shielded-wallet recipient (left = the 32-byte coin public key). */
export function shieldedRecipient(coinPublicKey: Uint8Array): MintRecipient {
  if (coinPublicKey.length !== 32) throw new Error("coin public key must be 32 bytes");
  return {
    is_left: true,
    left: { bytes: Uint8Array.from(coinPublicKey) },
    right: { bytes: new Uint8Array(32) },
  };
}

const leBigInt = (b: Uint8Array): bigint => {
  let v = 0n;
  for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]!);
  return v;
};

/**
 * Decodes a 32-byte Ed25519 point strictly: canonical encoding, not the
 * identity, prime order (no small-order or torsion component).
 */
export function ed25519PointFromBytes(bytes: Uint8Array, what = "point"): Curve25519Point {
  if (bytes.length !== 32) throw new Error(`${what} must be 32 bytes`);
  let p;
  try {
    p = ed25519.Point.fromBytes(Uint8Array.from(bytes), false);
  } catch (e) {
    throw new Error(`${what} is not a valid Ed25519 point: ${(e as Error).message}`);
  }
  if (p.is0() || p.isSmallOrder() || !p.isTorsionFree()) {
    throw new Error(`${what} is not a prime-order point`);
  }
  const pt = curve25519FromProjective(p) as Curve25519Point;
  if (!isValidCurve25519Point(pt)) throw new Error(`${what} is not a valid Curve25519Point`);
  return { x: pt.x, y: pt.y };
}

/** The contract's `operatorKey` constructor argument for a Solana public key (32 bytes). */
export function operatorKeyFromSolanaPublicKey(publicKey: Uint8Array): Curve25519Point {
  return ed25519PointFromBytes(publicKey, "operator public key");
}

/** A detached 64-byte Ed25519 signature → the circuit's `Ed25519Signature`; refuses s ≥ L. */
export function decodeEd25519Signature(sig: Uint8Array): Ed25519SignatureArg {
  if (sig.length !== 64) throw new Error("signature must be 64 bytes");
  const s = leBigInt(sig.subarray(32, 64));
  if (s >= ED25519_L) throw new Error("signature scalar s >= L (non-canonical)");
  return { r: ed25519PointFromBytes(sig.subarray(0, 32), "signature R"), s };
}

export type MintAuthorization = {
  /** Contract address, 32 bytes (hex without 0x accepted by the helpers). */
  contractAddress: Uint8Array;
  /** The deployment's sealed `networkTag` (32 bytes). */
  networkTag: Uint8Array;
  lockNonce: bigint;
  recipient: MintRecipient;
  amount: bigint;
};

/** `mintDigest(...)` through the contract's pure circuit. */
export function mintDigest(a: MintAuthorization): Uint8Array {
  if (a.contractAddress.length !== 32) throw new Error("contract address must be 32 bytes");
  if (a.networkTag.length !== 32) throw new Error("network tag must be 32 bytes");
  return bridgePureCircuits.mintDigest(
    { bytes: a.contractAddress },
    a.networkTag,
    a.lockNonce,
    a.recipient,
    a.amount,
  );
}

/** The 40-byte message the operator signs. */
export function mintMessage(a: MintAuthorization): Uint8Array {
  const digest = mintDigest(a);
  if (digest.length !== 32) throw new Error("mintDigest returned a non-32-byte value");
  const msg = new Uint8Array(MINT_MESSAGE_LEN);
  msg.set(MINT_MESSAGE_PREFIX, 0);
  msg.set(digest, MINT_MESSAGE_PREFIX.length);
  return msg;
}

/**
 * Signs a mint with the operator's Solana secret key (64 bytes: seed ‖ public
 * key, the Solana CLI keypair format), pre-checks the signature against the
 * key's own public half, and returns the circuit argument.
 */
export function signMint(
  operatorSecretKey: Uint8Array,
  a: MintAuthorization,
): { message: Uint8Array; signature: Uint8Array; sig: Ed25519SignatureArg } {
  if (operatorSecretKey.length !== 64) throw new Error("operator secret key must be 64 bytes");
  const message = mintMessage(a);
  const signature = nacl.sign.detached(message, operatorSecretKey);
  const publicKey = operatorSecretKey.subarray(32, 64);
  if (!nacl.sign.detached.verify(message, signature, publicKey)) {
    throw new Error("mint signature failed its own pre-check");
  }
  return { message, signature, sig: decodeEd25519Signature(signature) };
}

/** Verifies a mint signature against an operator public key (the relayer's pre-check). */
export function verifyMintSignature(
  operatorPublicKey: Uint8Array,
  a: MintAuthorization,
  signature: Uint8Array,
): boolean {
  return nacl.sign.detached.verify(mintMessage(a), signature, operatorPublicKey);
}

/** The bridge colour (shielded token type) of `sourceMint` at `contractAddress`. */
export function tokenColor(sourceMint: Uint8Array, contractAddress: Uint8Array): Uint8Array {
  return bridgePureCircuits.tokenColor(sourceMint, { bytes: contractAddress });
}

/**
 * JSON form of `mintFromSolana`'s arguments for the batcher's `MidnightAdapter`
 * (decimal strings for integers, hex for bytes), parsed back by the batcher's
 * `parseCircuitArgs` with the raw contract info (`readContractInfo()`).
 */
export function mintArgsJson(args: {
  lockNonce: bigint;
  recipient: MintRecipient;
  amount: bigint;
  mintNonce: Uint8Array;
  sig: Ed25519SignatureArg;
}): unknown[] {
  return [
    args.lockNonce.toString(),
    {
      is_left: args.recipient.is_left,
      left: { bytes: bytesToHex(args.recipient.left.bytes) },
      right: { bytes: bytesToHex(args.recipient.right.bytes) },
    },
    args.amount.toString(),
    bytesToHex(args.mintNonce),
    {
      r: { x: args.sig.r.x.toString(), y: args.sig.r.y.toString() },
      s: args.sig.s.toString(),
    },
  ];
}
