// Building the counterpart transaction for a transfer (pure apart from the
// random mint nonce; no RPC). The relayer hands the result to its embedded
// batcher: mints to the `midnight` MidnightAdapter, releases to the
// `solanaOperator` SolanaSignerAdapter.
import { randomBytes } from "node:crypto";
import { PublicKey, type Keypair } from "@solana/web3.js";
import { AddressType } from "@effectstream/utils";
import { signSolanaSignerInput, type DefaultBatcherInput } from "@effectstream/batcher-sdk";
import {
  createReleaseWithAtaInstructions,
  splitRecipientHex,
} from "@solana-midnight-bridge/contracts-solana/instructions";
import {
  bytesToHex,
  hexToBytes,
  mintArgsJson,
  shieldedRecipient,
  signMint,
} from "@solana-midnight-bridge/contracts-midnight/signing";
import type { RelayerCandidate } from "./policy.ts";

export const MIDNIGHT_TARGET = "midnight";
export const SOLANA_TARGET = "solanaOperator";

/** Compute budget for `[ATA idempotent create, Release]` (S3: Release ≈ 34k CU). */
export const RELEASE_COMPUTE_UNITS = 150_000;

export type BridgeAddresses = {
  /** Midnight contract address (64 hex). */
  contractAddress: string;
  /** The deployment's sealed network tag (64 hex). */
  networkTag: string;
  /** Solana program id and SPL mint (base58). */
  programId: string;
  mint: string;
};

let lastTimestamp = 0;
/**
 * Unique, strictly increasing millisecond timestamps (within this process):
 * the batcher keys its receipt callbacks on the input, timestamp included.
 */
export function nextTimestamp(): string {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return String(lastTimestamp);
}

/**
 * Solana → Midnight: `mintFromSolana(lockNonce, recipient, amount, mintNonce, sig)`
 * signed by the operator's Solana key, with the recipient's encryption key
 * mapping so the third-party shielded mint can be encrypted to it (engine E3).
 */
export function buildMintInput(
  job: Pick<RelayerCandidate, "sourceId" | "amount" | "recipient">,
  addrs: Pick<BridgeAddresses, "contractAddress" | "networkTag">,
  operatorSecretKey: Uint8Array,
  opts: { mintNonce?: Uint8Array; timestamp?: string } = {},
): { input: DefaultBatcherInput; mapping: [string, string] } {
  const { coinPublicKey, encryptionPublicKey } = splitRecipientHex(job.recipient);
  const recipient = shieldedRecipient(coinPublicKey);
  const mintNonce = opts.mintNonce ?? new Uint8Array(randomBytes(32));
  const { sig } = signMint(operatorSecretKey, {
    contractAddress: hexToBytes(addrs.contractAddress, 32, "contract address"),
    networkTag: hexToBytes(addrs.networkTag, 32, "network tag"),
    lockNonce: job.sourceId,
    recipient,
    amount: job.amount,
  });
  const mapping: [string, string] = [bytesToHex(coinPublicKey), bytesToHex(encryptionPublicKey)];
  const body = {
    circuit: "mintFromSolana",
    args: mintArgsJson({ lockNonce: job.sourceId, recipient, amount: job.amount, mintNonce, sig }),
    coinEncPublicKeyMappings: [mapping],
  };
  return {
    mapping,
    input: {
      address: "bridge-relayer",
      addressType: AddressType.MIDNIGHT,
      input: JSON.stringify(body),
      signature: "0x",
      timestamp: opts.timestamp ?? nextTimestamp(),
      target: MIDNIGHT_TARGET,
    } as DefaultBatcherInput,
  };
}

/**
 * Midnight → Solana: `[ATA idempotent create, Release{withdrawal_id, amount}]`
 * into the recipient owner's associated token account, operator = payer =
 * signer, signed for the SolanaSignerAdapter's operator check.
 */
export function buildReleaseInput(
  job: Pick<RelayerCandidate, "sourceId" | "amount" | "recipient">,
  addrs: Pick<BridgeAddresses, "programId" | "mint">,
  operator: Keypair,
  opts: { timestamp?: string } = {},
): { input: DefaultBatcherInput; destination: string } {
  const owner = new PublicKey(job.recipient);
  const { destination, instructions } = createReleaseWithAtaInstructions({
    programId: new PublicKey(addrs.programId),
    operator: operator.publicKey,
    payer: operator.publicKey,
    mint: new PublicKey(addrs.mint),
    recipientOwner: owner,
    withdrawalId: job.sourceId,
    amount: job.amount,
  });
  const input = signSolanaSignerInput({
    input: { instructions, computeUnitLimit: RELEASE_COMPUTE_UNITS },
    operatorSecretKey: operator.secretKey,
    target: SOLANA_TARGET,
    timestamp: opts.timestamp ?? nextTimestamp(),
  });
  return { input, destination: destination.toBase58() };
}
