import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { SolanaAdapter } from "@effectstream/batcher-sdk";

/**
 * SPL Memo program — the single program this batcher instance sponsors
 * ("program X"). Every sponsored tx's instructions must target it.
 */
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/**
 * Deterministic sponsor (fee-payer) keypair from a fixed seed, so the test can
 * fund it and know its pubkey. The batcher pays gas from this key.
 */
export const sponsorKeypair = Keypair.fromSeed(new Uint8Array(32).fill(9));
export const SPONSOR_ADDRESS = sponsorKeypair.publicKey.toBase58();

export const solanaAdapter = new SolanaAdapter({
  rpcUrl: "http://localhost:8899",
  batcherSecretKey: bs58.encode(sponsorKeypair.secretKey),
  targetProgramId: MEMO_PROGRAM_ID,
  syncProtocolName: "parallelSolanaRPC",
  maxBatchSize: 5,
});
