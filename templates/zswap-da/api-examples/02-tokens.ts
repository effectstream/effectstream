// 02-tokens.ts — List registered tokens; optionally register a new one.
// bun run api-examples/02-tokens.ts
// REGISTER=1 bun run api-examples/02-tokens.ts   # also POSTs a test token
//
// ⚠️  DEMO ONLY — /api/known-tokens is a temporary convenience endpoint for
// this demo. The official Midnight token-metadata standard is not yet live.
// Names and kinds stored here are manually curated and MUST NOT be trusted as
// authoritative token information.

import { get, post, print, header } from "./config.ts";

header("Known Tokens");
console.log("⚠️  WARNING: known-tokens is a demo endpoint. Token metadata is not authoritative — the Midnight token-metadata standard is not yet live.\n");

const tokens = await get("/api/known-tokens");
print("GET /api/known-tokens", tokens);

const list = tokens as Array<{ token_color: string; name: string; kind: string }>;
console.log(`\n${list.length} token(s) registered.`);
for (const t of list) {
  console.log(`  ${t.name.padEnd(16)} ${t.kind.padEnd(11)} ${t.token_color}`);
}

if (process.env.REGISTER === "1") {
  // Register a synthetic test token.  Change color/name to your own.
  const payload = {
    color: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    name: "EXAMPLE",
    kind: "shielded",
  };
  console.log("\nRegistering test token…");
  try {
    const result = await post("/api/known-tokens", payload);
    print("POST /api/known-tokens", result);
  } catch (e: any) {
    console.log("Registration failed (likely already exists):", e.message);
  }
}
