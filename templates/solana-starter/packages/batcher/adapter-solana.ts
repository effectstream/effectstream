import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { SolanaAdapter } from "@effectstream/batcher-sdk";

/** SPL Memo program — the single program this batcher sponsors ("program X"). */
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/**
 * Deterministic sponsor (fee-payer) keypair from a fixed dev seed. The batcher
 * pays gas from this key; the frontend sets it as the tx fee payer. Its pubkey
 * is J2xccRtuG43drESLYznHhLhQkLTdfepcKYbiQ9BsJVaf. (Dev only — use a real,
 * funded key in production.)
 */
export const sponsorKeypair = Keypair.fromSeed(new Uint8Array(32).fill(9));
export const SPONSOR_ADDRESS = sponsorKeypair.publicKey.toBase58();

export const solanaAdapter = new SolanaAdapter({
  rpcUrl: "http://localhost:8899",
  batcherSecretKey: bs58.encode(sponsorKeypair.secretKey),
  targetProgramId: MEMO_PROGRAM_ID,
  syncProtocolName: "mainSolanaRPC",
  maxBatchSize: 5,
});
