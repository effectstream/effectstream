import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

/**
 * Phase B: API surface tests.
 *
 * The night-bitcoin sync node exposes:
 *   GET  /api/intents?orderId=...        — returns the intent or 404
 *   POST /api/get-quotes                  — fans out to filler /api/quote endpoints
 *   GET  /api/faucet/nights?address=...   — dev faucet
 *   GET  /api/faucet/btc?address=...      — dev faucet
 *   GET  /api/check-processes             — orchestrator status proxy
 *
 * These tests verify shape & response codes only; they don't drive real
 * intents through the state machine (covered by intents.test.ts schema check
 * + future cross-chain e2e).
 */
export async function apiTest() {
  await assert("GET /api/intents returns 404 for unknown orderId", async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/api/intents?orderId=does-not-exist-${Date.now()}`,
    );
    return res.status === 404;
  });

  await assert("GET /api/intents requires orderId query param", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/intents`);
    // Fastify will reject the request with a 4xx because querystring schema is required.
    return res.status >= 400 && res.status < 500;
  });

  await assert("GET /api/check-processes returns a known status string", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/check-processes`);
    if (!res.ok) return false;
    const body = await res.text();
    // Fastify serialises plain strings as JSON quoted strings.
    const trimmed = body.replace(/^"|"$/g, "");
    return ["LOADING", "READY", "FILLERS-NOT-READY"].includes(trimmed);
  });

  await assert("POST /api/get-quotes rejects sub-dust BTC amounts", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/get-quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: `test-${Date.now()}`,
        fromToken: "BTC",
        toToken: "M20",
        fromAmount: 0.00000001, // 1 sat — well below the 546 sat dust limit
      }),
    });
    return res.status === 400;
  });

  await assert("POST /api/get-quotes returns array (may be empty if no fillers)", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/get-quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: `test-${Date.now()}`,
        fromToken: "M20",
        toToken: "BTC",
        fromAmount: 100,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data);
  });
}
