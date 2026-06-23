import { call, main, suspend } from "effection";
import {
  createNewBatcher,
  FileStorage,
  type BatcherConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";
import { ENV } from "@effectstream/utils/node-env";
import { getWriteNamespace } from "@effectstream/config";

import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { solanaAdapter, sponsorKeypair } from "./adapter-solana.ts";
import { config as solanaConfig } from "../node/config.dev.ts";

/** Dev convenience: fund the sponsor from the local faucet so it can pay fees. */
async function fundSponsor() {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const balance = await connection.getBalance(sponsorKeypair.publicKey, "confirmed");
  if (balance >= 1 * LAMPORTS_PER_SOL) return;
  const sig = await connection.requestAirdrop(sponsorKeypair.publicKey, 5 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
  console.log(`Funded sponsor ${sponsorKeypair.publicKey.toBase58()} with 5 SOL.`);
}

const port = ENV.getNumber("BATCHER_PORT", 3334);

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: 1000,
  enableHttpServer: true,
  namespace: getWriteNamespace(solanaConfig.securityNamespace) ?? "",
  // Submit + wait for the on-chain receipt; the node then indexes it and the
  // frontend reads it from GET /tables/solana_memos.
  confirmationLevel: "wait-receipt",
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./solana-batcher-data");

const batcher = createNewBatcher(config, storage);

batcher
  .addBlockchainAdapter("solana", solanaAdapter, {
    criteriaType: "size",
    maxBatchSize: 1,
  })
  .setDefaultTarget("solana");

main(function* () {
  console.log("Starting Solana fee-payer batcher (sponsor pays gas)...");
  try {
    yield* call(() => fundSponsor());
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
