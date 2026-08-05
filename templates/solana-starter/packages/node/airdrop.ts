// Airdrops SOL to the batcher fee-payer wallet for local dev.
//
// Uses @solana/web3.js rather than shelling out to the vendored `solana` CLI.
// The CLI's airdrop path returns "400 Bad Request" against the test validator it
// ships alongside (reproduced at matching 3.0.14 versions, with and without
// `-C`), while the plain `requestAirdrop` JSON-RPC call it wraps succeeds.
// Going direct also drops a dependency on the vendored binary's path — which
// only resolved once link.sh had provisioned it, so this step broke as soon as
// the template was installed from npm — and the `-C /tmp` workaround that
// scattered CLI config into the temp dir.
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";

const RPC_PORT = process.env.SOLANA_RPC_PORT ?? "8899";
const RPC_URL = `http://localhost:${RPC_PORT}`;

const BATCHER_KEYPAIR = path.resolve(
  import.meta.dirname!,
  "../batcher/keypair/batcher-wallet.json",
);

/** The test validator caps a single airdrop, so top up across a few rounds. */
const AIRDROP_SOL = 100;
const AIRDROP_ROUNDS = 2;

function fail(msg: string): never {
  console.error(`[airdrop] ${msg}`);
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(BATCHER_KEYPAIR)) {
    fail(`batcher keypair not found at ${BATCHER_KEYPAIR}`);
  }

  const secret = Uint8Array.from(
    JSON.parse(fs.readFileSync(BATCHER_KEYPAIR, "utf-8")) as number[],
  );
  const pubkey = Keypair.fromSecretKey(secret).publicKey;
  console.log(`[airdrop] batcher wallet: ${pubkey.toBase58()}`);

  const connection = new Connection(RPC_URL, "confirmed");

  for (let i = 1; i <= AIRDROP_ROUNDS; i++) {
    try {
      const sig = await connection.requestAirdrop(
        pubkey,
        AIRDROP_SOL * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`[airdrop] round ${i}: ${AIRDROP_SOL} SOL (${sig})`);
    } catch (e) {
      // Warn rather than crash the orchestrator: a later round may still land.
      console.warn(`[airdrop] round ${i} failed (continuing): ${String(e)}`);
    }
  }

  const balance = await connection.getBalance(pubkey, "confirmed");
  console.log(`[airdrop] balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance === 0) {
    // Fail loudly: every batcher test downstream depends on this wallet having
    // funds, and a silent 0 turns into a confusing assertion failure later.
    fail("batcher wallet still has 0 SOL — the batcher cannot pay fees");
  }
}

main().catch((e) => fail(String(e)));
