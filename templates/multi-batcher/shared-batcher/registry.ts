// PRODUCT REGISTRY — the whole multi-tenant configuration in one file.
//
// A product is: a target name + its own fee wallet + a transaction policy.
// The shared batcher builds one MidnightBalancingAdapter per entry, so fee
// capacity is hard-partitioned (separate worker pools, separate dust lanes):
// one product running dry cannot starve or spend another's dust.
//
// TWO RULES THAT MUST HOLD:
//  1. Every product needs its OWN wallet seed. Two adapters sharing a seed
//     book dust independently and double-spend the same coins (the SDK throws
//     at construction if you try).
//  2. Batcher fee wallets must never overlap the ACTOR wallets in
//     shared/env.ts — actors build transactions, batchers pay for them.

import {
  isMatchedDeltaSwap,
  type MidnightTxPolicy,
  zswapTokenDeltas,
} from "@effectstream/batcher-sdk/midnight-policy";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface Product {
  /** Target name clients address on /send-input. */
  target: string;
  /** Human label — log prefix and product directory name. */
  name: string;
  /** Fee wallet seed. MUST be unique across products. */
  walletSeed: string;
  /** Concurrent balance slots for this product (keep ≤ lanes/2 for headroom). */
  maxSlotsPerWallet: number;
  /** What this product is allowed to submit. */
  policy: MidnightTxPolicy<never>;
}

const TEMPLATE_ROOT = path.join(import.meta.dirname!, "..");

/**
 * Contract address of product-a's counter, written by its deploy step.
 * Read lazily: the registry is imported before the first deploy on a fresh
 * chain, and an absent address must not crash the batcher — it simply means
 * product-a's circuit allowlist is empty until deployment completes.
 */
export function counterContractAddress(networkId = "undeployed"): string | null {
  const file = path.join(
    TEMPLATE_ROOT,
    `product-a/contract-counter.${networkId}.json`,
  );
  try {
    return JSON.parse(readFileSync(file, "utf8")).contractAddress ?? null;
  } catch {
    return null;
  }
}

/**
 * product-c's custom filter: sponsor only *matched-delta* swap offers —
 * exactly two shielded token deltas of equal magnitude and opposite sign
 * (+X tokenA / −X tokenB). A one-sided transfer, a three-token basket or a
 * lopsided swap is refused even though it is "just a zswap".
 *
 * Written with the SAME helpers the declarative rules use
 * (`@effectstream/batcher-sdk/midnight-policy`). Must stay deterministic: it
 * runs at intake AND again before any dust is spent.
 */
export const matchedDeltaSwapFilter: NonNullable<
  MidnightTxPolicy<never>["allowCustomFinalFilter"]
> = ({ tx, declarativeVerdict }) => {
  // The declarative half already established this is a transfer-shaped tx.
  if (!declarativeVerdict.valid) return declarativeVerdict.valid;
  if (isMatchedDeltaSwap(tx)) return true;
  const deltas = [...zswapTokenDeltas(tx).entries()]
    .map(([token, value]) => `${token.slice(0, 8)}…:${value}`)
    .join(", ");
  return {
    valid: false,
    error:
      `not a matched-delta swap (need +X tokenA / −X tokenB; got [${deltas || "no net deltas"}])`,
  };
};

export function buildProducts(networkId = "undeployed"): Product[] {
  const counter = counterContractAddress(networkId);

  return [
    {
      // Contract-call product: may ONLY call increment() on its own counter.
      target: "product-a",
      name: "product-a",
      walletSeed: "00000000000000000000000000000000000000000000000000000000000000a0",
      maxSlotsPerWallet: Number(process.env.PRODUCT_A_SLOTS ?? 5),
      policy: {
        allowedCircuits: counter
          ? [{ contract: counter, entryPoint: "increment" }]
          : [],
      },
    },
    {
      // Transfer product: pure shielded transfers, no contract calls.
      target: "product-b",
      name: "product-b",
      walletSeed: "00000000000000000000000000000000000000000000000000000000000000b0",
      maxSlotsPerWallet: Number(process.env.PRODUCT_B_SLOTS ?? 5),
      policy: { allowZswapTransfers: true },
    },
    {
      // Swap product: transfers, further narrowed by a custom final filter.
      target: "product-c",
      name: "product-c",
      walletSeed: "00000000000000000000000000000000000000000000000000000000000000c0",
      maxSlotsPerWallet: Number(process.env.PRODUCT_C_SLOTS ?? 5),
      policy: {
        allowZswapTransfers: true,
        allowCustomFinalFilter: matchedDeltaSwapFilter,
      },
    },
  ];
}

/** Fail fast on the two invariants above. */
export function assertRegistryIsSane(products: Product[], actorSeeds: string[]): void {
  const seeds = new Map<string, string>();
  for (const p of products) {
    const owner = seeds.get(p.walletSeed);
    if (owner) {
      throw new Error(
        `Registry invalid: products "${owner}" and "${p.name}" share a wallet seed. ` +
          `Two adapters on one wallet double-spend its dust.`,
      );
    }
    seeds.set(p.walletSeed, p.name);
    if (actorSeeds.includes(p.walletSeed)) {
      throw new Error(
        `Registry invalid: product "${p.name}" uses an ACTOR wallet seed as its fee wallet.`,
      );
    }
  }
  const targets = new Set(products.map((p) => p.target));
  if (targets.size !== products.length) {
    throw new Error("Registry invalid: duplicate target names");
  }
}
