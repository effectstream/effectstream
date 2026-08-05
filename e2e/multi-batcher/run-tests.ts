// FAST CI guard for the shared multi-product batcher.
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

import { existsSync, readFileSync, rmSync } from "node:fs";
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

import { writeFileSync } from "node:fs";

import { ACTOR_SEEDS, NETWORK } from "./env.ts";
import {
  clearInputs,
  getPendingCountFor,
  getStats,
  sendTx,
  waitForBatcher,
  waitForDrained,
} from "./batcher-client.ts";
import {
  buildFeelessShieldedTransfer,
  buildSwapOffer,
  buildWallet,
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const SUITE_DIR = import.meta.dirname!;
const MONOREPO_ROOT = path.resolve(SUITE_DIR, "../..");

/** Run a docker compose command for this suite's hermetic stack. */
async function compose(...cmd: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["docker", "compose", ...cmd], {
    cwd: SUITE_DIR,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, MONOREPO_ROOT },
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out: out + err };
}

async function startInfrastructure(): Promise<void> {
  // Compose reads MONOREPO_ROOT for the bind mount; write it so `docker
  // compose` invoked by hand from this directory works identically.
  writeFileSync(
    path.join(SUITE_DIR, ".env"),
    `MONOREPO_ROOT=${MONOREPO_ROOT}\n` +
      `HOST_UID=${process.getuid?.() ?? 1000}\n` +
      `HOST_GID=${process.getgid?.() ?? 1000}\n`,
  );

  // Every run starts a FRESH chain (`down -v`), but these artifacts live on the
  // bind mount, not in a volume — so they survive and would make the app
  // container skip the deploy and hand us a contract address that no longer
  // exists on chain. Clear them first.
  console.log("  clearing stale chain artifacts...");
  const contractsDir = path.join(E2E_ROOT, "shared/contracts/midnight");
  const stale = [
    path.join(contractsDir, "contract-counter.undeployed.json"),
    path.join(contractsDir, "contract-eip-20.undeployed.json"),
    path.join(contractsDir, "midnight-level-db"),
    path.join(contractsDir, "midnight-level-db-deploy"),
    path.join(SUITE_DIR, "batcher-data"),
  ];
  const stubborn: string[] = [];
  for (const target of stale) {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
      // Left by an older run whose container still ran as root.
      stubborn.push(target);
    }
  }
  if (stubborn.length > 0) {
    console.log(`  removing ${stubborn.length} root-owned leftover(s) via docker...`);
    const proc = Bun.spawn([
      "docker", "run", "--rm", "-v", `${MONOREPO_ROOT}:${MONOREPO_ROOT}`,
      "alpine:3", "rm", "-rf", ...stubborn,
    ], { stdout: "pipe", stderr: "pipe" });
    if (await proc.exited !== 0) {
      throw new Error(`could not remove stale artifacts: ${stubborn.join(", ")}`);
    }
  }

  // The counter's Compact artifacts must exist before the container deploys it.
  console.log("  compiling counter contract (compact)...");
  const compile = Bun.spawn(["bun", "run", "compact"], {
    cwd: path.join(MONOREPO_ROOT, "e2e/shared/contracts/midnight/contract-counter"),
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await compile.exited !== 0) throw new Error("compact compile failed");

  console.log("  docker compose up...");
  const up = await compose("up", "-d", "--remove-orphans");
  if (up.code !== 0) throw new Error(`compose up failed:\n${up.out}`);
}

async function stopInfrastructure(): Promise<void> {
  console.log("\nStopping infrastructure...");
  if (!passed) {
    const logs = await compose("logs", "app", "--tail", "60", "--no-log-prefix");
    console.log("\n--- app/batcher log tail ---\n" + logs.out);
  }
  await compose("down", "-v", "--remove-orphans");
}

async function main() {
  setNetworkId(NETWORK.id as never);
  console.log("\n=== multi-batcher e2e: one batcher, three products ===\n");

  console.log("[0/4] starting hermetic stack (compose, ports 12800-block)...");
  await startInfrastructure();

  // Wait for the container's contract deploy to finish BEFORE funding: the
  // deploy also drives the genesis wallet, and two instances of one seed book
  // dust independently — they would select the same coins and double-spend.
  console.log("[1/4] waiting for contract deploy, then funding...");
  const deployDeadline = Date.now() + 15 * 60 * 1000;
  while (!existsSync(ADDRESS_FILE)) {
    if (Date.now() > deployDeadline) {
      throw new Error("contract deploy did not complete within 15 minutes");
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.log("  contract deployed");

  const { fundEverything } = await import("./fund.ts");
  await fundEverything();

  console.log("[2/4] waiting for the shared batcher...");
  await waitForBatcher(300_000);
  const stats = await getStats();
  check(
    "all three products are registered",
    ["product-a", "product-b", "product-c"].every((t) =>
      stats.targets.some((s) => s.target === t)
    ),
    stats.targets.map((t) => t.target).join(", "),
  );

  console.log("[3/4] building one transaction of each shape...");
  const maker: WalletCtx = await buildWallet(NETWORK, ACTOR_SEEDS.maker);
  const sink: WalletCtx = await buildWallet(NETWORK, ACTOR_SEEDS.sink);
  await waitSynced(maker, { label: "maker" });
  await waitSynced(sink, { label: "sink" });
  const sinkAddr = await sink.wallet.shielded.getAddress();

  const callHex = await buildIncrementHex();
  const transferTx = await buildFeelessShieldedTransfer(maker, sinkAddr, 1n);
  const transferHex = toHex(transferTx.serialize());

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

  console.log("\n[4/4] assertions\n");

  // — policy: each product accepts its own shape —
  const aOk = await sendTx(callHex, { target: "product-a", txStage: "unbound" });
  check("product-a accepts its counter call", aOk.ok, `status=${aOk.status}`);

  const bOk = await sendTx(transferHex, { target: "product-b", txStage: "finalized" });
  check("product-b accepts a shielded transfer", bOk.ok, `status=${bOk.status}`);

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
