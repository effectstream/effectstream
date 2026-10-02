#!/usr/bin/env bun
// Waits until the contract prover answers `/version` with 9.0.0-rc.8.
//
// The URL is MIDNIGHT_CONTRACT_PROOF_SERVER_URL when set (an external prover,
// e.g. the S4 harness's native-arm64 sibling: Q10 A, nothing is launched), else
// the local one the orchestrator starts on BRIDGE_CONTRACT_PROOF_SERVER_PORT
// (default 6301). The first start pulls the image and fetches the SRS, so the
// default timeout is generous.
import { midnightUrls } from "../network.ts";

const url = midnightUrls("local").contractProofServer;
const timeoutMs = Number(process.env.BRIDGE_CONTRACT_PROVER_WAIT_MS ?? 900_000);
const started = Date.now();
let last = "";
while (Date.now() - started < timeoutMs) {
  try {
    const res = await fetch(new URL("/version", url), { signal: AbortSignal.timeout(5_000) });
    const v = res.ok ? (await res.text()).trim() : `HTTP ${res.status}`;
    if (v.includes("9.0.0-rc.8")) {
      console.log(`[wait-contract-prover] ${new URL(url).host} is ${v}`);
      process.exit(0);
    }
    if (v !== last) console.log(`[wait-contract-prover] ${new URL(url).host} answered "${v}"; waiting for 9.0.0-rc.8`);
    last = v;
  } catch {
    /* not up yet */
  }
  await Bun.sleep(2_000);
}
console.error(`[wait-contract-prover] ${url} did not report 9.0.0-rc.8 within ${timeoutMs} ms`);
process.exit(1);
