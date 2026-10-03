// Local-dev launcher for solana-test-validator (Agave 3.0.14, vendored by
// @effectstream/solana-node): preloads build/bridge.so at the local program id
// and resets the ledger each boot (SOLANA_RESET=false keeps it).
//
// Download, SHA-256 verification and ledger setup live in
// @effectstream/solana-node's `run()`. Its `--bind-address` (default 127.0.0.1,
// SOLANA_BIND_ADDRESS overrides it; Agave 3.0.14 panics on 0.0.0.0) only keeps
// gossip/TPU on that address: the JSON-RPC and the faucet listen on EVERY
// interface, and Agave 3.0.14 has no flag to change that (questions file Q19).
// Do not run the local stack on an untrusted network.
import { run } from "@effectstream/solana-node";
import fs from "node:fs";
import path from "node:path";
import { LOCAL_BRIDGE_PROGRAM_ID } from "./program-id.ts";
import { DEV_SOLANA_FAUCET_PORT, DEV_SOLANA_RPC_PORT } from "./dev-config.ts";

const RESET = (process.env.SOLANA_RESET ?? "true") !== "false";
const PROGRAM_SO = path.join(import.meta.dirname!, "build", "bridge.so");

async function main() {
  if (!fs.existsSync(PROGRAM_SO)) {
    console.error(
      `[chain:start] Missing ${PROGRAM_SO}.\n` +
        "Run `bun run --filter @solana-midnight-bridge/contracts-solana build` first.",
    );
    process.exit(1);
  }
  console.log(
    `[chain:start] solana-test-validator\n  rpc:     http://localhost:${DEV_SOLANA_RPC_PORT}\n  faucet:  ${DEV_SOLANA_FAUCET_PORT}\n  program: ${LOCAL_BRIDGE_PROGRAM_ID}`,
  );
  const { child } = await run({
    rpcPort: DEV_SOLANA_RPC_PORT,
    faucetPort: DEV_SOLANA_FAUCET_PORT,
    reset: RESET,
    verbose: process.env.SOLANA_VERBOSE === "1",
    ...(process.env.SOLANA_DATA_DIR ? { dataDir: process.env.SOLANA_DATA_DIR } : {}),
    bpfPrograms: [{ address: LOCAL_BRIDGE_PROGRAM_ID, soPath: PROGRAM_SO }],
  });
  child.on("close", (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  console.error("[chain:start] failed:", err);
  process.exit(1);
});
