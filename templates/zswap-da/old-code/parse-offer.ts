import { dirname, resolve } from "@std/path";
import {
  Transaction,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v7";
import type { StoredOffer, TokenEntry } from "./types.ts";

// --- Reusable offer parser ---

interface DeltaEntry {
  token: string;
  delta: string;
  direction: "GIVING" | "WANTING" | "ZERO";
}

interface VerificationEntry {
  token: string;
  type: "shielded" | "unshielded";
  expectedAmount: string;
  transactionDelta: string | null;
  match: boolean;
}

interface GuaranteedOfferInfo {
  inputs: number;
  outputs: number;
  transients: number;
  deltas: DeltaEntry[];
}

interface FallibleOfferInfo {
  segment: string;
  inputs: number;
  outputs: number;
  transients: number;
  deltas: DeltaEntry[];
}

interface IntentInfo {
  segment: string;
  actionsCount: number;
  ttl: string;
}

export interface ParsedOffer {
  id: number;
  version: number;
  status: string;
  createdAt?: string;
  gives: TokenEntry[];
  wants: TokenEntry[];
  guaranteedOffer: GuaranteedOfferInfo | null;
  fallibleOffers: FallibleOfferInfo[];
  intents: IntentInfo[];
  aggregatedDeltas: DeltaEntry[];
  givesVerification: VerificationEntry[];
  wantsVerification: VerificationEntry[];
}

function deltasToEntries(
  deltas: Map<string, bigint>,
): DeltaEntry[] {
  const entries: DeltaEntry[] = [];
  for (const [tokenType, delta] of deltas) {
    entries.push({
      token: tokenType,
      delta: delta.toString(),
      direction: delta > 0n ? "GIVING" : delta < 0n ? "WANTING" : "ZERO",
    });
  }
  return entries;
}

export function parseOffer(
  offerData: Record<string, unknown>,
): ParsedOffer {
  const offer = offerData as unknown as StoredOffer;

  // Deserialize the transaction
  const base64Str = (offer.transaction ??
    (offerData.serializedOffer as string)) as string;
  const raw = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
  const tx = Transaction.deserialize(
    "signature" as const,
    "pre-proof" as const,
    "pre-binding" as const,
    raw,
  ) as UnprovenTransaction;

  // Guaranteed offer
  let guaranteedOffer: GuaranteedOfferInfo | null = null;
  if (tx.guaranteedOffer) {
    guaranteedOffer = {
      inputs: tx.guaranteedOffer.inputs.length,
      outputs: tx.guaranteedOffer.outputs.length,
      transients: tx.guaranteedOffer.transients.length,
      deltas: deltasToEntries(tx.guaranteedOffer.deltas),
    };
  }

  // Fallible offers
  const fallibleOffers: FallibleOfferInfo[] = [];
  if (tx.fallibleOffer && tx.fallibleOffer.size > 0) {
    for (const [segment, fallOffer] of tx.fallibleOffer) {
      fallibleOffers.push({
        segment: String(segment),
        inputs: fallOffer.inputs.length,
        outputs: fallOffer.outputs.length,
        transients: fallOffer.transients.length,
        deltas: deltasToEntries(fallOffer.deltas),
      });
    }
  }

  // Intents
  const intents: IntentInfo[] = [];
  if (tx.intents) {
    for (const [segment, intent] of tx.intents) {
      intents.push({
        segment: String(segment),
        actionsCount: intent.actions.length,
        ttl: String(intent.ttl),
      });
    }
  }

  // Aggregate deltas
  const allDeltas = new Map<string, bigint>();
  if (tx.guaranteedOffer) {
    for (const [tokenType, delta] of tx.guaranteedOffer.deltas) {
      allDeltas.set(tokenType, (allDeltas.get(tokenType) ?? 0n) + delta);
    }
  }
  if (tx.fallibleOffer) {
    for (const [_segment, fallOffer] of tx.fallibleOffer) {
      for (const [tokenType, delta] of fallOffer.deltas) {
        allDeltas.set(tokenType, (allDeltas.get(tokenType) ?? 0n) + delta);
      }
    }
  }

  const aggregatedDeltas = deltasToEntries(allDeltas);

  // Verify gives
  const gives: TokenEntry[] = offer.gives ?? [];
  const wants: TokenEntry[] = offer.wants ?? [];

  const givesVerification: VerificationEntry[] = gives.map((entry) => {
    const delta = allDeltas.get(entry.token);
    const expectedAmount = BigInt(entry.amount);
    return {
      token: entry.token,
      type: entry.type,
      expectedAmount: entry.amount,
      transactionDelta: delta !== undefined ? delta.toString() : null,
      match: delta !== undefined && delta === expectedAmount,
    };
  });

  // Verify wants
  const wantsVerification: VerificationEntry[] = wants.map((entry) => {
    const delta = allDeltas.get(entry.token);
    const expectedAmount = BigInt(entry.amount);
    return {
      token: entry.token,
      type: entry.type,
      expectedAmount: entry.amount,
      transactionDelta: delta !== undefined ? delta.toString() : null,
      match: delta !== undefined && -delta === expectedAmount,
    };
  });

  return {
    id: offer.id,
    version: offer.version ?? 0,
    status: offer.status ?? "unknown",
    createdAt: offer.metadata?.createdAt ??
      (offerData.createdAt as string | undefined),
    gives,
    wants,
    guaranteedOffer,
    fallibleOffers,
    intents,
    aggregatedDeltas,
    givesVerification,
    wantsVerification,
  };
}

// --- Standalone CLI usage ---
if (import.meta.main) {
  const currentDir = resolve(dirname(new URL(import.meta.url).pathname));
  const offerPath = resolve(
    currentDir,
    "..",
    "database",
    "offers",
    "offer-1.json",
  );

  const offerJson = JSON.parse(await Deno.readTextFile(offerPath));
  const parsed = parseOffer(offerJson);

  console.log("=== Offer File Metadata ===");
  console.log("ID:", parsed.id);
  console.log("Version:", parsed.version);
  console.log("Status:", parsed.status);
  console.log("Created At:", parsed.createdAt);

  console.log("\nGives:");
  for (const entry of parsed.gives) {
    console.log(
      `  Token: ${entry.token}, Amount: ${entry.amount}, Type: ${entry.type}`,
    );
  }

  console.log("\nWants:");
  for (const entry of parsed.wants) {
    console.log(
      `  Token: ${entry.token}, Amount: ${entry.amount}, Type: ${entry.type}`,
    );
  }

  console.log("\n=== Guaranteed Offer ===");
  if (parsed.guaranteedOffer) {
    console.log("Inputs:", parsed.guaranteedOffer.inputs);
    console.log("Outputs:", parsed.guaranteedOffer.outputs);
    console.log("Transients:", parsed.guaranteedOffer.transients);
    console.log("Deltas:");
    for (const d of parsed.guaranteedOffer.deltas) {
      console.log(`  Token: ${d.token} -> Delta: ${d.delta} (${d.direction})`);
    }
  } else {
    console.log("(none)");
  }

  console.log("\n=== Fallible Offers ===");
  if (parsed.fallibleOffers.length > 0) {
    for (const fo of parsed.fallibleOffers) {
      console.log(`Segment ${fo.segment}:`);
      console.log("  Inputs:", fo.inputs);
      console.log("  Outputs:", fo.outputs);
      console.log("  Transients:", fo.transients);
      console.log("  Deltas:");
      for (const d of fo.deltas) {
        console.log(
          `    Token: ${d.token} -> Delta: ${d.delta} (${d.direction})`,
        );
      }
    }
  } else {
    console.log("(none)");
  }

  console.log("\n=== Intents ===");
  if (parsed.intents.length > 0) {
    for (const intent of parsed.intents) {
      console.log(`Segment ${intent.segment}:`);
      console.log("  Actions:", intent.actionsCount);
      console.log("  TTL:", intent.ttl);
    }
  } else {
    console.log("(none)");
  }

  console.log("\n=== Verification ===");
  console.log("Aggregated deltas:");
  for (const d of parsed.aggregatedDeltas) {
    console.log(`  Token: ${d.token} -> ${d.delta} (${d.direction})`);
  }

  console.log("\n--- Gives Verification ---");
  for (const v of parsed.givesVerification) {
    console.log(`Give token (${v.token}) [${v.type}]:`);
    console.log(`  Expected amount: ${v.expectedAmount}`);
    console.log(`  Transaction delta: ${v.transactionDelta ?? "NOT FOUND"}`);
    console.log(`  Match: ${v.match ? "YES" : "NO"}`);
  }

  console.log("\n--- Wants Verification ---");
  for (const v of parsed.wantsVerification) {
    console.log(`Want token (${v.token}) [${v.type}]:`);
    console.log(`  Expected amount: ${v.expectedAmount}`);
    console.log(`  Transaction delta: ${v.transactionDelta ?? "NOT FOUND"}`);
    console.log(`  Match: ${v.match ? "YES" : "NO"}`);
  }
}
