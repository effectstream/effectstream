// FAST CI guard for the shared multi-product batcher.
//
// Infrastructure is the orchestrator's native-binary graph (launcher.cli.ts),
// matching every other e2e suite — the CI test image has no docker CLI. The
// exhaustive Docker-based harness lives in templates/multi-batcher.
//
// Scope: prove the wiring still works — every product accepts its own
// transaction shape, refuses the others, and routing errors are refused.
// Each assertion is ONE cheap transaction; stress, fault injection and the
// exhaustive rule matrix live in templates/multi-batcher/tests (deep suite).
//
// products a and b are asserted end to end (accepted → on chain). product-c is
// asserted at the AUTHORIZATION layer only: its shape is a matched-delta swap
// OFFER, which is half a trade and cannot settle without the counterparty side
// a solver would supply. Its queue is cleared instead — which doubles as the
// check that target-scoped admin only touches its own target.
//
//   bun run e2e/multi-batcher/run-tests.ts
//   bun run e2e/runner.ts multi-batcher

import "@midnight-ntwrk/onchain-runtime-v3";

import { readFileSync } from "node:fs";
import path from "node:path";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
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
// NOTE: the counter module is imported LAZILY (see loadCounter). Its
// `./managed/contract/index.js` only exists after the Compact compile that
// startInfrastructure runs, so a static import here would fail at load time.
// The package's "." export also points at a non-existent _index.ts — the
// working entry point is this subpath on the contracts package.
type CounterModule = typeof import("@e2e/midnight-contracts/counter");
let counterModule: CounterModule | null = null;
async function loadCounter(): Promise<CounterModule> {
  counterModule ??= await import("@e2e/midnight-contracts/counter");
  return counterModule;
}

import {
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
} from "@e2e/engine";
import { MidnightNames } from "@effectstream/orchestrator/launch-midnight";

import { ACTOR_SEEDS, NETWORK } from "./env.ts";
import {
  clearInputs,
  getPendingCountFor,
  getStats,
  sendTx,
  waitForBatcher,
  waitForDrained,
} from "./batcher-client.ts";
import { assertNoDrift } from "./check-drift.ts";
import {
  buildFeelessShieldedTransfer,
  buildSwapOffer,
  buildWallet,
  ignoreCleanWebSocketClose,
  deriveSeedForRole,
  getShieldedBalance,
  shieldedTokenId,
  toHex,
  waitSynced,
  type WalletCtx,
} from "./wallet.ts";

const E2E_ROOT = path.join(import.meta.dirname!, "..");
const ADDRESS_FILE = path.join(
  E2E_ROOT,
  "shared/contracts/midnight/contract-counter.undeployed.json",
);
const MANAGED_DIR = path.join(
  E2E_ROOT,
  "shared/contracts/midnight/contract-counter/src/managed",
);

let failures = 0;
function check(name: string, pass: boolean, detail = ""): void {
  console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
}

// ---------------------------------------------------------------------------
// Transaction builders
// ---------------------------------------------------------------------------

/** Captured contract-call txs (the wallet provider throws once it stashes one). */
const capturedTxs: string[] = [];

function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<string, PS>();
  const signingKeys = new Map<string, string>();
  let contractAddress = "";
  return {
    setContractAddress(address: string) {
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
    async setSigningKey(a: string, k: string) {
      signingKeys.set(a, k);
    },
    async getSigningKey(a: string) {
      return signingKeys.get(a) ?? null;
    },
    async removeSigningKey(a: string) {
      signingKeys.delete(a);
    },
  } as PrivateStateProvider<PSI, PS>;
}

async function buildIncrementHex(): Promise<string> {
  const { Counter, witnesses } = await loadCounter();
  const { contractAddress } = JSON.parse(readFileSync(ADDRESS_FILE, "utf8"));
  const keys = ZswapSecretKeys.fromSeed(deriveSeedForRole(ACTOR_SEEDS.maker, Roles.Zswap));
  const capture: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => keys.coinPublicKey,
    getEncryptionPublicKey: () => keys.encryptionPublicKey,
    balanceTx(tx: UnboundTransaction): never {
      capturedTxs.push(toHex(tx.serialize()));
      throw new Error("captured-for-delegation");
    },
    submitTx(): never {
      throw new Error("submitTx must not be reached in capture mode");
    },
  } as never;

  const zkConfigProvider = new NodeZkConfigProvider(MANAGED_DIR);
  const providers = {
    privateStateProvider: inMemoryPrivateStateProvider<string, unknown>(),
    publicDataProvider: indexerPublicDataProvider(NETWORK.indexer, NETWORK.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(NETWORK.proofServer, zkConfigProvider),
    walletProvider: capture,
    midnightProvider: capture,
  };
  const compiled = CompiledContract.make("contract-counter", Counter.Contract).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(MANAGED_DIR),
  );
  const deployed = await findDeployedContract(providers as never, {
    contractAddress,
    compiledContract: compiled as never,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 },
  } as never);
  try {
    await (deployed as { callTx: { increment: () => Promise<unknown> } }).callTx.increment();
  } catch {
    // expected — the capture provider throws after stashing the tx
  }
  const hex = capturedTxs.shift();
  if (!hex) throw new Error("increment tx was not captured");
  return hex;
}

async function readCounter(): Promise<bigint> {
  const { Counter } = await loadCounter();
  const { contractAddress } = JSON.parse(readFileSync(ADDRESS_FILE, "utf8"));
  const pdp = indexerPublicDataProvider(NETWORK.indexer, NETWORK.indexerWS);
  const state = await pdp.queryContractState(contractAddress);
  if (!state) throw new Error("no contract state");
  return BigInt(Counter.ledger(state.data).round);
}

/** Rewrite the serialized network id without fabricating a transaction. */
function rewriteNetworkId(hex: string, from: string, to: string): string {
  const fromBytes = Buffer.from(from);
  const toBytes = Buffer.from(to);
  if (fromBytes.length !== toBytes.length) {
    throw new Error("network-id regression requires equal-length ids");
  }
  const bytes = Buffer.from(hex, "hex");
  let replacements = 0;
  for (let offset = bytes.indexOf(fromBytes); offset >= 0; offset = bytes.indexOf(fromBytes, offset + toBytes.length)) {
    toBytes.copy(bytes, offset);
    replacements += 1;
  }
  if (replacements === 0) throw new Error(`serialized transaction did not contain ${from}`);
  return bytes.toString("hex");
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const SUITE_DIR = import.meta.dirname!;
const LAUNCHER_PATH = path.resolve(SUITE_DIR, "./launcher.cli.ts");

async function main() {
  ignoreCleanWebSocketClose("multi-batcher e2e");
  setNetworkId(NETWORK.id as never);
  console.log("\n=== multi-batcher e2e: one batcher, three products ===\n");

  // Before anything expensive: the wallet helpers exist in two copies (here and
  // in the template, which must ship standalone) and have silently drifted
  // before. Costs milliseconds; failing here beats failing 15 minutes in.
  assertNoDrift();

  // compile → midnight node/indexer/proof-server → contract deploy → fund →
  // batcher, sequenced by the orchestrator's dependency graph (launcher.cli.ts).
  // Funding is a `waitToExit` prerequisite of the batcher because adapters read
  // their wallets at construction: a batcher started first comes up unfunded.
  console.log("[1/3] starting infrastructure...");
  await startInfrastructure(LAUNCHER_PATH);
  await waitForOrchestrator();

  // Wait on each critical stage rather than only on the batcher's health.
  // startInfrastructure() returns as soon as the orchestrator is spawned, so
  // without these a dead compile/deploy/fund would just look like a batcher
  // that never got healthy — 15 minutes to reach a misleading error.
  await waitForProcess(MidnightNames.NODE_WAIT, { waitForExit: true, timeoutMs: 300_000 });
  await waitForProcess(MidnightNames.INDEXER_WAIT, { waitForExit: true, timeoutMs: 300_000 });
  await waitForProcess(MidnightNames.CONTRACT_DEPLOY, { waitForExit: true, timeoutMs: 600_000 });
  console.log("  contract deployed");
  await waitForProcess("fund", { waitForExit: true, timeoutMs: 1_200_000 });
  console.log("  products funded");

  console.log("[2/3] waiting for the shared batcher...");
  await waitForBatcher(300_000);
  const stats = await getStats();
  check(
    "all three products are registered",
    ["product-a", "product-b", "product-c"].every((t) =>
      stats.targets.some((s) => s.target === t)
    ),
    stats.targets.map((t) => t.target).join(", "),
  );

  console.log("[3/3] building one transaction of each shape...");
  const maker: WalletCtx = await buildWallet(NETWORK, ACTOR_SEEDS.maker);
  const sink: WalletCtx = await buildWallet(NETWORK, ACTOR_SEEDS.sink);
  await waitSynced(maker, { label: "maker" });
  await waitSynced(sink, { label: "sink" });
  const sinkAddr = await sink.wallet.shielded.getAddress();

  const callHex = await buildIncrementHex();
  const transferTx = await buildFeelessShieldedTransfer(maker, sinkAddr, 1n);
  const transferHex = toHex(transferTx.serialize());
  // Keep the real transaction/proof/signatures and alter only its serialized
  // network identifier. Full validation is intentionally off at intake, so a
  // receipt-waiting caller must first be admitted and then receive the typed
  // permanent rejection from the pre-spend worker.
  const wrongNetworkHex = rewriteNetworkId(transferHex, NETWORK.id, "wrong-netx");

  // product-c wants a MATCHED-DELTA swap offer: +X tokenA / −X tokenB. That
  // needs a second token type, which the shared counter contract can issue —
  // a contract's token colors are derived deterministically from
  // (domain separator, contract address), so the color is well-defined here
  // whether or not any coin of it has been minted yet.
  //
  // The maker SPENDS 1 native (it holds that) and the offer CREATES 1 of the
  // contract's token back to the maker (it does not hold that — the
  // counterparty supplies it). Deltas: +1 native / −1 contract token.
  const { rawTokenType } = await import("@midnight-ntwrk/ledger-v8");
  const { contractAddress: counterAddress } = JSON.parse(
    readFileSync(ADDRESS_FILE, "utf8"),
  );
  const SWAP_DOMAIN_SEP = new Uint8Array(32).fill(0xc3);
  const nativeToken = shieldedTokenId();
  const swapToken = String(rawTokenType(SWAP_DOMAIN_SEP, counterAddress))
    .replace(/^0x/, "").toLowerCase();
  const makerAddr = await maker.wallet.shielded.getAddress();
  const swapTx = await buildSwapOffer(maker, { [nativeToken]: 1n }, [
    { token: swapToken, amount: 1n, receiverAddress: makerAddr },
  ]);
  const swapHex = toHex(swapTx.serialize());

  // Print what the ledger actually reports for each shape — product-c's filter
  // decides on exactly these deltas, so a surprise here explains any verdict.
  {
    const { Transaction } = await import("@midnight-ntwrk/ledger-v8");
    const { fromHex } = await import("@midnight-ntwrk/midnight-js-utils");
    const { zswapTokenDeltas } = await import("@effectstream/batcher-sdk/midnight-policy");
    const show = (label: string, hex: string, stage: "unproven" | "finalized") => {
      try {
        const tx = stage === "unproven"
          ? Transaction.deserialize("signature", "pre-proof", "pre-binding", fromHex(hex))
          : Transaction.deserialize("signature", "proof", "binding", fromHex(hex));
        const deltas = [...zswapTokenDeltas(tx as never).entries()]
          .map(([t, v]) => `${t.slice(0, 10)}…=${v}`);
        console.log(`  ${label} deltas: [${deltas.join(", ") || "none (nets to zero)"}]`);
      } catch (e) {
        console.log(`  ${label} deltas: <undecodable: ${e}>`);
      }
    };
    show("swap offer (spend native, create contract token)", swapHex, "unproven");
    show("plain transfer", transferHex, "finalized");
  }

  const counterBefore = await readCounter();
  const sinkBefore = await getShieldedBalance(sink);

  console.log("\n  assertions\n");

  // — policy: each product accepts its own shape —
  const aOk = await sendTx(callHex, { target: "product-a", txStage: "unbound" });
  check("product-a accepts its counter call", aOk.ok, `status=${aOk.status}`);

  const bOk = await sendTx(transferHex, { target: "product-b", txStage: "finalized" });
  check("product-b accepts a shielded transfer", bOk.ok, `status=${bOk.status}`);

  const wrongNetwork = await sendTx(wrongNetworkHex, {
    target: "product-b",
    txStage: "finalized",
    confirmationLevel: "wait-receipt",
    timeoutMs: 300_000,
  });
  const wrongNetworkBody = wrongNetwork.body as { errorCode?: string; retryable?: boolean } | null;
  check(
    "wrong-network work is permanently rejected by the pre-spend gate",
    !wrongNetwork.ok && wrongNetwork.status === 400 &&
      wrongNetworkBody?.errorCode === "NOT_WELL_FORMED" &&
      wrongNetworkBody.retryable === false,
    `status=${wrongNetwork.status} body=${JSON.stringify(wrongNetwork.body)}`,
  );

  const cOk = await sendTx(swapHex, { target: "product-c", txStage: "unproven" });
  check("product-c accepts a matched-delta swap", cOk.ok, `status=${cOk.status}`);

  // — policy: each product refuses the others' shapes —
  const aBad = await sendTx(transferHex, { target: "product-a", txStage: "finalized" });
  check("product-a refuses a transfer (circuit allowlist)", !aBad.ok && aBad.status === 400, `status=${aBad.status}`);

  const bBad = await sendTx(callHex, { target: "product-b", txStage: "unbound" });
  check("product-b refuses a contract call (transfers only)", !bBad.ok && bBad.status === 400, `status=${bBad.status}`);

  const cBad = await sendTx(transferHex, { target: "product-c", txStage: "finalized" });
  check(
    "product-c refuses a balanced transfer (custom filter)",
    !cBad.ok && cBad.status === 400,
    `status=${cBad.status}`,
  );

  // — routing —
  const noTarget = await sendTx(transferHex, { target: "product-b", txStage: "finalized", omitTarget: true });
  check("unaddressed input is refused", !noTarget.ok && noTarget.status === 400, `status=${noTarget.status}`);

  const unknown = await sendTx(transferHex, { target: "product-zzz", txStage: "finalized" });
  check("unknown target is refused", !unknown.ok && unknown.status === 404, `status=${unknown.status}`);

  // — scoped admin: retire product-c's offer before waiting on delivery —
  // A swap OFFER is half a trade: unbalanced by construction, so it cannot
  // settle without the counterparty side a solver would merge in. product-c
  // therefore proves the policy path (accept/reject), not delivery — and
  // clearing just its queue exercises target-scoped admin at the same time.
  const cPendingBefore = await getPendingCountFor("product-c");
  await clearInputs("product-c");
  check(
    "clearing one target leaves the others' queues intact",
    (await getPendingCountFor("product-c")) === 0 && cPendingBefore >= 1,
    `product-c ${cPendingBefore}→0`,
  );

  // — delivery: the accepted work actually lands on chain —
  console.log("\n  …waiting for accepted work to settle\n");
  const drained = await waitForDrained(undefined, 600_000);
  await new Promise((r) => setTimeout(r, 15_000));

  const counterDelta = Number(await readCounter() - counterBefore);
  check("product-a's call landed on chain", counterDelta === 1, `counter +${counterDelta}`);

  const sinkDelta = Number((await getShieldedBalance(sink)) - sinkBefore);
  check("product-b's transfer landed on chain", sinkDelta >= 1, `sink +${sinkDelta}`);

  check("every queue drained", drained, `pending=${(await getStats()).totalPendingInputs}`);

  await Promise.allSettled([maker.wallet.stop(), sink.wallet.stop()]);

  console.log(
    `\n=== multi-batcher e2e: ${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`} ===\n`,
  );
}

let exitCode = 1;
let passed = false;
try {
  await main();
  passed = failures === 0;
  exitCode = passed ? 0 : 1;
} catch (e) {
  console.error("[multi-batcher e2e] fatal:", e);
  exitCode = 1;
} finally {
  await stopInfrastructure().catch(() => {});
}
process.exit(exitCode);
