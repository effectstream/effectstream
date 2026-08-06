// The shared multi-product batcher under test: ONE process, ONE port, three
// products, each with its own fee wallet, worker pool and transaction policy.
//
// Mirrors templates/multi-batcher/shared-batcher — kept small and explicit so
// the e2e suite is readable on its own.

import { main, suspend } from "effection";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type BatcherConfig,
  createNewBatcher,
  type DefaultBatcherInput,
  FileStorage,
  MidnightBalancingAdapter,
} from "@effectstream/batcher-sdk";
import {
  isMatchedDeltaSwap,
  type MidnightTxPolicy,
  zswapTokenDeltas,
} from "@effectstream/batcher-sdk/midnight-policy";

import { NETWORK, PRODUCT_SEEDS } from "../env.ts";
import { ignoreCleanWebSocketClose } from "../wallet.ts";

// Wallet teardown closes the indexer websocket, which the SDK surfaces as an
// unhandled rejection. Without this the batcher can die mid-suite.
ignoreCleanWebSocketClose("e2e-multi-batcher");

const PORT = Number(process.env.BATCHER_PORT ?? 3334);
const E2E_ROOT = path.join(import.meta.dirname!, "../..");

function counterAddress(): string | null {
  try {
    return JSON.parse(
      readFileSync(
        path.join(E2E_ROOT, "shared/contracts/midnight/contract-counter.undeployed.json"),
        "utf8",
      ),
    ).contractAddress ?? null;
  } catch {
    return null;
  }
}

/**
 * product-c: sponsor only MATCHED-DELTA swap offers — exactly two token types,
 * equal magnitude, opposite sign (+X tokenA / −X tokenB).
 *
 * This is a swap OFFER: half of a trade, deliberately unbalanced. The maker
 * publishes "I give X of A, I want X of B" and a counterparty (or a solver)
 * completes it. Sponsoring offers is why the shape matters — the rule pins the
 * sponsor to a fair 1:1 trade and refuses anything else, including ordinary
 * balanced transfers, which net to zero deltas and match no swap at all.
 *
 * Built from the SAME exported helpers the declarative rules use
 * (`@effectstream/batcher-sdk/midnight-policy`). Deterministic: it runs at
 * intake and again pre-batch, and must reach the same verdict both times.
 */
const matchedDeltaSwapFilter: NonNullable<
  MidnightTxPolicy<never>["allowCustomFinalFilter"]
> = ({ tx, declarativeVerdict }) => {
  if (!declarativeVerdict.valid) return false;
  if (isMatchedDeltaSwap(tx)) return true;
  const deltas = [...zswapTokenDeltas(tx).entries()]
    .map(([t, v]) => `${t.slice(0, 8)}…:${v}`).join(", ");
  return {
    valid: false,
    error: `not a matched-delta swap (got [${deltas || "no net deltas"}])`,
  };
};

const counter = counterAddress();
const products = [
  {
    target: "product-a",
    seed: PRODUCT_SEEDS["product-a"],
    policy: {
      allowedCircuits: counter ? [{ contract: counter, entryPoint: "increment" }] : [],
    } satisfies MidnightTxPolicy<never>,
  },
  {
    target: "product-b",
    seed: PRODUCT_SEEDS["product-b"],
    policy: { allowZswapTransfers: true } satisfies MidnightTxPolicy<never>,
  },
  {
    target: "product-c",
    seed: PRODUCT_SEEDS["product-c"],
    policy: {
      allowZswapTransfers: true,
      allowCustomFinalFilter: matchedDeltaSwapFilter,
    } satisfies MidnightTxPolicy<never>,
  },
];

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: 500,
  enableHttpServer: true,
  enableEventSystem: false,
  namespace: "e2e-multi-batcher",
  confirmationLevel: "no-wait",
  port: PORT,
  requireExplicitTarget: true,
};

const storage = new FileStorage(
  process.env.BATCHER_STORAGE_DIR ?? path.join(import.meta.dirname!, "../batcher-data"),
);
const batcher = createNewBatcher(config, storage);

for (const p of products) {
  const adapter = new MidnightBalancingAdapter(p.seed, {
    indexer: NETWORK.indexer,
    indexerWS: NETWORK.indexerWS,
    node: NETWORK.node,
    proofServer: NETWORK.proofServer,
    walletNetworkId: NETWORK.id as never,
    syncProtocolName: p.target,
    maxSlotsPerWallet: 2,
    logLabel: p.target,
    policy: p.policy,
  });
  batcher.addBlockchainAdapter(p.target, adapter, {
    criteriaType: "size",
    maxBatchSize: 1,
  });
}

main(function* () {
  console.log(
    `[e2e-multi-batcher] ${products.length} products on :${PORT} (counter=${counter ?? "not deployed"})`,
  );
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("[e2e-multi-batcher] error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
