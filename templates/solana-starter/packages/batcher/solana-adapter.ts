import { SolanaAdapter } from "@effectstream/batcher-sdk";
import type { SolanaAdapterConfig } from "@effectstream/batcher-sdk";
import fs from "node:fs";
import path from "node:path";
import bs58 from "bs58";

/**
 * Build a `SolanaAdapter` (fee-payer sponsor) for the dev environment.
 *
 * The adapter holds the sponsor (fee-payer) keypair. The user partially signs
 * a transaction whose fee payer is the batcher's sponsor key and whose every
 * instruction targets `targetProgramId`; the batcher validates it, co-signs as
 * fee payer, and submits — the user pays 0 SOL.
 *
 * The counter program creates a PDA funded by the sponsor, so this adapter
 * enables `allowSponsorAsInstructionAccount` (the sponsor legitimately appears
 * as the rent payer). Per-program scoping (`targetProgramId`) still confines
 * the sponsor to the counter program.
 *
 * For dev, the keypair lives at
 *   packages/batcher/keypair/batcher-wallet.json
 * and is committed. The orchestrator airdrops SOL to its address on boot
 * ( see packages/node/airdrop.ts ).
 *
 * For mainnet, source the keypair from a secret manager and never commit
 * the file.
 */
export interface SolanaAdapterEnv {
  rpcUrl: string;
  /** Path to a Solana keypair JSON file ( array of 64 bytes ). */
  batcherKeypairPath: string;
  syncProtocolName: string;
  /** The single program this batcher sponsors (e.g. the counter program). */
  targetProgramId: string;
  /** Max transactions submitted per batch cycle. */
  maxBatchSize?: number;
  /**
   * True for programs that need the sponsor to fund rent (PDA creation), like
   * the counter program. False for pure transfer/log programs (e.g. SPL Memo).
   */
  allowSponsorAsInstructionAccount?: boolean;
}

function loadBatcherSecretKey(keypairPath: string): string {
  const resolved = path.resolve(process.cwd(), keypairPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `[batcher] Fee-payer keypair not found at ${resolved}. ` +
        `Generate one with \`solana-keygen new --outfile ${keypairPath}\`.`,
    );
  }
  // Keypair JSON is an array of 64 bytes: first 32 are the pubkey, last 32
  // are the secret. The Solana SDK expects the full 64-byte secret key in
  // base58.
  const bytes = JSON.parse(fs.readFileSync(resolved, "utf-8")) as number[];
  if (bytes.length !== 64) {
    throw new Error(
      `[batcher] ${keypairPath} is ${bytes.length} bytes, expected 64. Regenerate it.`,
    );
  }
  return bs58.encode(Uint8Array.from(bytes));
}

export function createSolanaAdapter(env: SolanaAdapterEnv): SolanaAdapter {
  const config: SolanaAdapterConfig = {
    rpcUrl: env.rpcUrl,
    batcherSecretKey: loadBatcherSecretKey(env.batcherKeypairPath),
    syncProtocolName: env.syncProtocolName,
    targetProgramId: env.targetProgramId,
    maxBatchSize: env.maxBatchSize,
    allowSponsorAsInstructionAccount: env.allowSponsorAsInstructionAccount,
  };
  return new SolanaAdapter(config);
}
