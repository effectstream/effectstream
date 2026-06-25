// Airdrops SOL to the batcher fee-payer wallet for local dev, via the
// vendored Solana CLI from @effectstream/solana-node.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SOL_BIN = path.join(
  import.meta.dirname!,
  "node_modules/@effectstream/solana-node/vendor/bin/solana",
);
const RPC_PORT = process.env.SOLANA_RPC_PORT ?? "8899";

const BATCHER_KEYPAIR = path.resolve(
  import.meta.dirname!,
  "../batcher/keypair/batcher-wallet.json",
);

function fail(msg: string): never {
  console.error(`[airdrop] ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(SOL_BIN)) {
    fail(
      `vendored solana CLI not found at ${SOL_BIN}\n` +
        `Did you run \`./link.sh\` to provision @effectstream/solana-node?`,
    );
  }
  if (!fs.existsSync(BATCHER_KEYPAIR)) {
    fail(`batcher keypair not found at ${BATCHER_KEYPAIR}`);
  }

  const pubkeyResult = spawnSync(SOL_BIN, ["-C", "/tmp", "address", "-k", BATCHER_KEYPAIR], {
    encoding: "utf-8",
  });
  if (pubkeyResult.status !== 0) {
    fail(`solana address failed: ${pubkeyResult.stderr}`);
  }
  const pubkey = pubkeyResult.stdout.trim();
  console.log(`[airdrop] batcher wallet: ${pubkey}`);

  // Twice: test-validator caps each airdrop at 100 SOL.
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(
      SOL_BIN,
      ["-C", "/tmp", "airdrop", "100", "--url", `http://localhost:${RPC_PORT}`, pubkey],
      { encoding: "utf-8" },
    );
    if (result.status !== 0) {
      // Warn rather than crash the orchestrator (validator may not be ready).
      console.warn(`[airdrop] airdrop attempt ${i + 1} failed (continuing):`);
      console.warn(result.stderr || result.stdout);
      continue;
    }
    console.log(`[airdrop] ${result.stdout.trim()}`);
  }

  const balResult = spawnSync(
    SOL_BIN,
    ["-C", "/tmp", "balance", "--url", `http://localhost:${RPC_PORT}`, pubkey],
    { encoding: "utf-8" },
  );
  if (balResult.status === 0) {
    console.log(`[airdrop] balance: ${balResult.stdout.trim()}`);
  }
}

main();
