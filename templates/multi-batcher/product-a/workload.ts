// Contract-call workload: counter.increment() call transactions captured at
// balanceTx time (proven via the proof LB, unbound) and delegated to the
// batcher's midnight-balancer target for dust balancing + submission.
//
// Usage (host):
//   bun run workload:calls -- --count 10 --concurrency 4 [--verify]
//
// Ground truth: the on-chain `round` counter increases by exactly the number
// of delivered calls (the Counter ledger type is commutative).

// Single WASM instance — must be first.
import "@midnight-ntwrk/onchain-runtime-v3";

import { readFileSync } from "node:fs";
import path from "node:path";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type {
  MidnightProvider,
  PrivateStateProvider,
  UnboundTransaction,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { ZswapSecretKeys } from "@midnight-ntwrk/ledger-v8";
import { Roles } from "@midnightntwrk/wallet-sdk-hd";

import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "./contract-counter/src/index.ts";

import { ACTOR_SEEDS, NETWORK } from "../shared/env.ts";
import { sendTx, waitForBatcher } from "../shared/batcher-client.ts";
import {
  deriveSeedForRole,
  ignoreCleanWebSocketClose,
  toHex,
} from "../shared/wallet.ts";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const COUNT = Number(flag("count", "5"));
const CONCURRENCY = Number(flag("concurrency", "4"));
const VERIFY = args.includes("--verify");
const VERIFY_TIMEOUT_MS = Number(flag("verify-timeout", "600000"));

const CONTRACTS_DIR = import.meta.dirname!;
const ADDRESS_FILE = path.join(CONTRACTS_DIR, `contract-counter.${NETWORK.id}.json`);
const MANAGED_DIR = path.join(CONTRACTS_DIR, "contract-counter/src/managed");

export const TARGET = "product-a";

/**
 * Captured tx hexes, FIFO. midnight-js wraps errors thrown from balanceTx in
 * its own error types, so an instanceof check on the catch side is unreliable —
 * the stash is the ground truth (night-bitcoin's lastCapturedTx pattern). All
 * captured txs are identical increment calls, so FIFO pairing is safe under
 * concurrency.
 */
const capturedTxs: string[] = [];

/**
 * In-memory private state provider — the Level provider locks its DB per
 * operation and fails under concurrent calls; the counter has no private
 * state that matters.
 */
function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<string, PS>();
  const signingKeys = new Map<string, string>();
  let contractAddress = "";
  return {
    setContractAddress(address: string): void {
      contractAddress = address;
    },
    async set(id: PSI, state: PS) {
      states.set(`${contractAddress}:${String(id)}`, state);
    },
    async get(id: PSI) {
      return states.get(`${contractAddress}:${String(id)}`) ?? null;
    },
    async remove(id: PSI) {
      states.delete(`${contractAddress}:${String(id)}`);
    },
    async clear() {
      states.clear();
    },
    async setSigningKey(address: string, signingKey: string) {
      signingKeys.set(address, signingKey);
    },
    async getSigningKey(address: string) {
      return signingKeys.get(address) ?? null;
    },
    async removeSigningKey(address: string) {
      signingKeys.delete(address);
    },
  } as PrivateStateProvider<PSI, PS>;
}

function buildProviders() {
  // Identity keys only — the caller wallet never spends tokens, so no wallet
  // process is needed; the batcher pays fees.
  const keys = ZswapSecretKeys.fromSeed(deriveSeedForRole(ACTOR_SEEDS.bMaker, Roles.Zswap));
  const captureProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => keys.coinPublicKey,
    getEncryptionPublicKey: () => keys.encryptionPublicKey,
    balanceTx(tx: UnboundTransaction): never {
      capturedTxs.push(toHex(tx.serialize()));
      throw new Error("captured-for-delegation");
    },
    submitTx(): never {
      throw new Error("submitTx should never be reached in capture mode");
    },
  } as never;

  const zkConfigProvider = new NodeZkConfigProvider(MANAGED_DIR);
  return {
    privateStateProvider: inMemoryPrivateStateProvider<string, CounterPrivateState>(),
    publicDataProvider: indexerPublicDataProvider(NETWORK.indexer, NETWORK.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(NETWORK.proofServer, zkConfigProvider),
    walletProvider: captureProvider,
    midnightProvider: captureProvider,
  };
}

export async function readCounter(): Promise<bigint> {
  const { contractAddress } = JSON.parse(readFileSync(ADDRESS_FILE, "utf8"));
  const publicDataProvider = indexerPublicDataProvider(NETWORK.indexer, NETWORK.indexerWS);
  const state = await publicDataProvider.queryContractState(contractAddress);
  if (!state) throw new Error(`no contract state at ${contractAddress}`);
  const ledgerState = Counter.ledger(state.data);
  return BigInt(ledgerState.round);
}

/** Build ONE increment call tx (unbound hex) without submitting it. */
export async function buildIncrementHex(): Promise<string> {
  const { contractAddress } = JSON.parse(readFileSync(ADDRESS_FILE, "utf8"));
  const providers = buildProviders();
  const compiled = CompiledContract.make("contract-counter", Counter.Contract).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(MANAGED_DIR),
  );
  const deployed = await findDeployedContract(providers as never, {
    contractAddress,
    compiledContract: compiled as never,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 } satisfies CounterPrivateState,
  } as never);
  try {
    await (deployed as { callTx: { increment: () => Promise<unknown> } }).callTx.increment();
  } catch {
    // expected: the capture provider throws once the tx is stashed
  }
  const hex = capturedTxs.shift();
  if (!hex) throw new Error("increment tx was not captured");
  return hex;
}

async function main() {
  setNetworkId(NETWORK.id as never);
  await waitForBatcher();

  const { contractAddress } = JSON.parse(readFileSync(ADDRESS_FILE, "utf8"));
  console.log(`[product-a] contract: ${contractAddress}`);

  const providers = buildProviders();
  const compiled = CompiledContract.make("contract-counter", Counter.Contract).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(MANAGED_DIR),
  );

  console.log("[product-a] finding deployed contract...");
  const deployed = await findDeployedContract(providers as never, {
    contractAddress,
    compiledContract: compiled as never,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 } satisfies CounterPrivateState,
  } as never);

  const before = VERIFY ? await readCounter() : 0n;
  if (VERIFY) console.log(`[product-a] counter before: ${before}`);

  console.log(`[product-a] submitting ${COUNT} increment calls (concurrency=${CONCURRENCY})...`);
  let accepted = 0;
  let rejected = 0;
  let buildFailed = 0;
  const t0 = performance.now();

  const jobs = Array.from({ length: COUNT }, (_, i) => i);
  const workers = Array.from({ length: Math.min(CONCURRENCY, COUNT) }, async () => {
    for (;;) {
      const i = jobs.shift();
      if (i === undefined) return;
      const buildStart = performance.now();
      let hex: string | undefined;
      try {
        await (deployed as { callTx: { increment: () => Promise<unknown> } }).callTx.increment();
        buildFailed += 1;
        console.error(`[product-a] #${i}: pipeline completed without capture (unexpected)`);
        continue;
      } catch (e) {
        hex = capturedTxs.shift();
        if (!hex) {
          buildFailed += 1;
          console.error(`[product-a] #${i}: build failed: ${e instanceof Error ? e.message : e}`);
          continue;
        }
      }
      const buildMs = Math.round(performance.now() - buildStart);
      const result = await sendTx(hex, { target: TARGET, txStage: "unbound", address: "product-a-caller" });
      if (result.ok) {
        accepted += 1;
        console.log(`[product-a] #${i}: accepted (build+prove=${buildMs}ms, ${accepted}/${COUNT})`);
      } else {
        rejected += 1;
        console.error(`[product-a] #${i}: REJECTED status=${result.status} body=${JSON.stringify(result.body)}`);
      }
    }
  });
  await Promise.all(workers);
  const wallMs = Math.round(performance.now() - t0);
  console.log(`[product-a] submit done: accepted=${accepted} rejected=${rejected} buildFailed=${buildFailed} in ${wallMs}ms`);

  let delivered: number | null = null;
  if (VERIFY) {
    const want = before + BigInt(accepted);
    console.log(`[product-a] verifying: waiting for counter ${before} → ${want}...`);
    const start = Date.now();
    for (;;) {
      const now = await readCounter();
      delivered = Number(now - before);
      if (now >= want) break;
      if (Date.now() - start > VERIFY_TIMEOUT_MS) {
        console.error(`[product-a] VERIFY TIMEOUT: delivered ${delivered}/${accepted}`);
        break;
      }
      console.log(`[product-a] delivered so far: ${delivered}/${accepted}`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
    console.log(`[product-a] delivered: ${delivered}/${accepted}`);
  }

  console.log(JSON.stringify({
    kind: TARGET,
    count: COUNT,
    accepted,
    rejected,
    buildFailed,
    delivered,
    wallMs,
  }));
  process.exit(delivered !== null && delivered < accepted ? 1 : 0);
}

if (import.meta.main) {
  ignoreCleanWebSocketClose("product-a");
  main().catch((e) => {
    console.error("[product-a] FAILED:", e);
    process.exit(1);
  });
}
