// API-surface checks against the running node (:9999). Runs right after the
// lifecycle flow so the settled blob proves the negative liveness path:
// resubmitting a consumed offer must be rejected by the accounting the
// midnight-nullifier primitive wrote. (The offer carries a 30-minute TTL, so
// this must not be moved behind anything slow.)

import type { Client } from "pg";
import { API_PORT, assert } from "../helpers.ts";
import type { ZswapFlowResult } from "./zswap-flow.test.ts";

const API = `http://127.0.0.1:${API_PORT}`;

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any;
  try {
    parsed = await r.json();
  } catch {
    parsed = await r.text();
  }
  return { status: r.status, body: parsed };
}

export async function apiTest(_db: Client, ctx: ZswapFlowResult): Promise<void> {
  await assert(
    "POST /api/zswap/submit rejects garbage with 400 BAD_ENCODING",
    async () => {
      const r = await postJson("/api/zswap/submit", { blob: "not-a-zswap-offer" });
      return r.status === 400 && r.body?.error === "BAD_ENCODING";
    },
  );

  if (ctx.blob) {
    const blob = ctx.blob;
    await assert(
      "resubmitting the settled offer → 400 NULLIFIER_SPENT (primitive accounting feeds the gate)",
      async () => {
        const r = await postJson("/api/zswap/submit", { blob });
        return r.status === 400 && r.body?.error === "NULLIFIER_SPENT";
      },
    );
  } else {
    console.log(
      "⏭  resubmit NULLIFIER_SPENT check skipped (no settled blob from the flow)",
    );
  }

  if (ctx.colors) {
    const colors = ctx.colors;
    await assert(
      "GET /api/known-tokens lists the minted test tokens with the mint colors",
      async () => {
        const r = await fetch(`${API}/api/known-tokens`);
        if (!r.ok) return false;
        const list = (await r.json()) as any[];
        const byName = new Map(list.map((t: any) => [t.name, t.token_color]));
        // POST /api/known-tokens uppercases names on registration.
        return (
          byName.get("TESTTOKENA") === colors.shieldedA &&
          byName.get("TESTTOKENB") === colors.shieldedB &&
          byName.get("TESTTOKENU") === colors.unshielded
        );
      },
    );
  } else {
    console.log("⏭  known-tokens mint-color check skipped (no colors from the flow)");
  }

  const freshColor = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  await assert("POST /api/known-tokens registers a new color", async () => {
    const r = await postJson("/api/known-tokens", {
      color: freshColor,
      name: "E2EToken",
      kind: "shielded",
    });
    return r.status === 200 && r.body?.success === true && r.body?.color === freshColor;
  });

  // Duplicate registrations throw in the handler, which the runtime surfaces
  // as a 500 — assert "rejected", not a specific status.
  await assert("re-registering the same color is rejected", async () => {
    const r = await postJson("/api/known-tokens", {
      color: freshColor,
      name: "E2EToken2",
      kind: "shielded",
    });
    return r.status >= 400;
  });

  await assert("GET /api/midnight/config exposes the contract + endpoints", async () => {
    const r = await fetch(`${API}/api/midnight/config`);
    if (!r.ok) return false;
    const c = (await r.json()) as any;
    return (
      typeof c.contractAddress === "string" &&
      c.contractAddress.length > 0 &&
      Boolean(c.indexerUri) &&
      Boolean(c.proofServerUri) &&
      Boolean(c.networkId)
    );
  });
}
