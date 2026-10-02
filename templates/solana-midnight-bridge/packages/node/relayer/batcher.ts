// The relayer's EMBEDDED batcher (sub-plan T4.2; the night-bitcoin-v2 filler
// pattern): no HTTP server, so its inputs never leave this process (Q13), and
// two adapters:
//   "midnight"        MidnightAdapter on the bridge contract, paid by the
//                     operator's Midnight wallet (DUST). The wallet facade
//                     proves DUST on `proofServer` (dust/9) and the contract
//                     circuit proves on `contractProofServer` (rc.8): engine E2.
//                     Mints carry `coinEncPublicKeyMappings` (engine E3).
//   "solanaOperator"  SolanaSignerAdapter with the operator Solana key, allowed
//                     programs {bridge, associated-token} (+ ComputeBudget,
//                     always allowed): engine E5.
//
// The batcher's own storage is a fresh temporary directory per process and its
// retry budget is 1: the relayer (relayer_jobs + backoff) owns retries, so a
// restart never replays a stale queue on top of the relayer's own re-attempts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bs58 from "bs58";
import type { Keypair } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createNewBatcher,
  FileStorage,
  MidnightAdapter,
  SolanaSignerAdapter,
  type BatcherConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";
import {
  BridgeContract,
  CONTRACT_NAME,
  MANAGED_DIR,
  batcherContractInfo,
} from "@solana-midnight-bridge/contracts-midnight/contract";
import type { BridgeMidnightUrls } from "@solana-midnight-bridge/contracts-midnight/network";
import { MIDNIGHT_SYNC_PROTOCOL, SOLANA_SYNC_PROTOCOL } from "../config.ts";
import { isInfraFailure } from "./policy.ts";
import { MIDNIGHT_TARGET, SOLANA_TARGET } from "./jobs.ts";

export type EmbeddedBatcherOptions = {
  contractAddress: string;
  midnightSeed: string;
  midnightUrls: BridgeMidnightUrls;
  solanaRpcUrl: string;
  solanaOperator: Keypair;
  programId: string;
  log?: (msg: string) => void;
};

const errText = (e: unknown): string => {
  const parts: string[] = [];
  let cur: any = e;
  for (let i = 0; cur && i < 5; i++) {
    parts.push(cur instanceof Error ? cur.message : String(cur));
    cur = cur?.cause;
  }
  return parts.join(" <- ");
};

export function createEmbeddedBatcher(o: EmbeddedBatcherOptions) {
  const log = o.log ?? ((m: string) => console.log(`[relayer-batcher] ${m}`));
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-relayer-batcher-"));

  const midnight = new MidnightAdapter(
    o.contractAddress,
    o.midnightSeed,
    {
      indexer: o.midnightUrls.indexer,
      indexerWS: o.midnightUrls.indexerWS,
      node: o.midnightUrls.node,
      proofServer: o.midnightUrls.proofServer,
      contractProofServer: o.midnightUrls.contractProofServer,
      zkConfigPath: MANAGED_DIR,
      contractName: CONTRACT_NAME,
      privateStateStoreName: `bridge-relayer-${o.midnightUrls.id}`,
      privateStateId: "bridgeRelayer",
      contractJoinTimeoutSeconds: 600,
      walletFundingTimeoutSeconds: 900,
      // rc.8 proves the k17 mint in ~15-20 s plus the prover-key upload; the
      // facade then proves DUST and the node finalizes.
      callTxTimeoutSeconds: 600,
      walletNetworkId: o.midnightUrls.id,
    },
    BridgeContract,
    {},
    // The 0.35.0 contract info with Curve25519Point/Scalar translated for the
    // batcher's argument parser (questions-file Q16).
    batcherContractInfo() as any,
    MIDNIGHT_SYNC_PROTOCOL,
    1,
  );

  const solana = new SolanaSignerAdapter({
    rpcUrl: o.solanaRpcUrl,
    operatorSecretKey: bs58.encode(o.solanaOperator.secretKey),
    allowedProgramIds: [o.programId, ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()],
    syncProtocolName: SOLANA_SYNC_PROTOCOL,
    commitment: "confirmed",
  });

  const config: BatcherConfig<DefaultBatcherInput> = {
    pollingIntervalMs: 1000,
    namespace: "solana-midnight-bridge-relayer",
    confirmationLevel: "wait-receipt",
    enableHttpServer: false,
    enableEventSystem: false,
    port: 0,
    maxRetries: 1,
    retryDelayMs: 1000,
  };
  const batcher = createNewBatcher(config, new FileStorage(storageDir));
  batcher
    .addBlockchainAdapter(MIDNIGHT_TARGET, midnight, { criteriaType: "size", maxBatchSize: 1 })
    .addBlockchainAdapter(SOLANA_TARGET, solana, { criteriaType: "size", maxBatchSize: 1 })
    .setDefaultTarget(MIDNIGHT_TARGET);

  // A submit failure is reported as a batcher "error" event (phase "batch"),
  // not through the input's receipt promise: route it to the one attempt in
  // flight for that target. Infrastructure failures are parked and retried
  // by the batcher itself, so the attempt keeps waiting for its receipt.
  const pending = new Map<string, (e: Error) => void>();
  batcher.addStateTransition("error", (ev: any) => {
    if (ev?.phase !== "batch") return;
    const msg = errText(ev.error);
    const reject = pending.get(ev.target);
    if (!reject) return;
    if (isInfraFailure(msg)) {
      log(`${ev.target}: infrastructure failure, the batcher will retry: ${msg.slice(0, 300)}`);
      return;
    }
    reject(new Error(msg));
  });

  async function submit(input: DefaultBatcherInput, timeoutMs: number): Promise<{ tx: string }> {
    const target = input.target!;
    if (pending.has(target)) throw new Error(`an attempt is already in flight on ${target}`);
    let rejectFailure!: (e: Error) => void;
    const failure = new Promise<never>((_, reject) => {
      rejectFailure = reject;
    });
    pending.set(target, rejectFailure);
    const receipt = batcher.batchInput(input, "wait-receipt", timeoutMs);
    receipt.catch(() => {});
    failure.catch(() => {});
    try {
      const r = await Promise.race([receipt, failure]);
      if (!r) throw new Error("the batcher returned no receipt");
      if ((r as any).status === 0) throw new Error(`transaction ${r.hash} failed on chain`);
      return { tx: String(r.hash) };
    } finally {
      pending.delete(target);
    }
  }

  return { batcher, submit, storageDir, midnight, solana };
}
