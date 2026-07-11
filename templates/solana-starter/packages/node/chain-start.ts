// Local-dev launcher for solana-test-validator (vendored via
// @effectstream/solana-node). Loads the pre-compiled counter program at the
// fixed COUNTER_PROGRAM_ID and resets the ledger each boot (SOLANA_RESET).
// For production, deploy with `solana program deploy` instead.
import bin from "@effectstream/solana-node";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { COUNTER_PROGRAM_ID } from "@solana-starter/contracts-solana/program-id";

const RPC_PORT = Number(process.env.SOLANA_RPC_PORT ?? "8899");
const FAUCET_PORT = Number(process.env.SOLANA_FAUCET_PORT ?? "9900");
const RESET = (process.env.SOLANA_RESET ?? "true") !== "false";

const NODE_DIR = import.meta.dirname!;
const TEMPLATE_ROOT = path.resolve(NODE_DIR, "../..");
const PROGRAM_SO = path.join(
  TEMPLATE_ROOT,
  "packages/contracts-solana/build/counter.so",
);

async function main() {
  await bin.run(["--version"]);

  if (!fs.existsSync(PROGRAM_SO)) {
    console.error(
      `[chain:start] Missing ${path.relative(TEMPLATE_ROOT, PROGRAM_SO)}.\n` +
        `Run \`bun run --filter @solana-starter/contracts-solana build\` first.`,
    );
    process.exit(1);
  }

  const ledgerDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "solana-starter-ledger-"),
  );
  fs.mkdirSync(path.join(ledgerDir, "ledger"), { recursive: true });

  const args = [
    "--ledger",
    path.join(ledgerDir, "ledger"),
    "--rpc-port",
    String(RPC_PORT),
    "--faucet-port",
    String(FAUCET_PORT),
    "--bind-address",
    "0.0.0.0",
    "--bpf-program",
    COUNTER_PROGRAM_ID,
    PROGRAM_SO,
  ];
  if (RESET) args.push("--reset");

  console.log(
    `[chain:start] solana-test-validator\n  rpc:    http://localhost:${RPC_PORT}\n  faucet: ${FAUCET_PORT}\n  program: ${COUNTER_PROGRAM_ID}\n  ledger: ${ledgerDir}`,
  );

  // COPYFILE_DISABLE prevents macOS from materializing AppleDouble (`._`)
  // companion files when the validator archives/unarchives genesis, which
  // otherwise aborts ledger creation with
  // "Archive error: extra entry found: ._genesis.bin". No-op on Linux.
  const child = spawn(bin.path(), args, {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    stdio: "inherit",
  });
  child.on("close", (code) => {
    if (code !== 0) {
      console.log(`[chain:start] solana-test-validator exited with ${code}`);
      process.exit(code ?? 1);
    }
  });
}

main().catch((err) => {
  console.error("[chain:start] failed:", err);
  process.exit(1);
});
