/**
 * Boots solana-test-validator with the e2e test program preloaded at its fixed
 * program id. Everything else — download, checksum verification, ledger setup,
 * loopback bind, output capture — is handled by @effectstream/solana-node.
 */
import { run } from "@effectstream/solana-node";
import path from "node:path";
import { TEST_EVENT_PROGRAM_ID } from "./program-id.ts";

const PROGRAM_SO = path.join(import.meta.dirname!, "test_event.so");

await run({
  rpcPort: Number(process.env.SOLANA_RPC_PORT ?? "8899"),
  faucetPort: Number(process.env.SOLANA_FAUCET_PORT ?? "9900"),
  reset: (process.env.SOLANA_RESET ?? "true") !== "false",
  verbose: process.argv.includes("--verbose"),
  bpfPrograms: [{ address: TEST_EVENT_PROGRAM_ID, soPath: PROGRAM_SO }],
});
