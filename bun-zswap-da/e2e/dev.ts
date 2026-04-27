/**
 * ZSwap-DA dev runner.
 *
 * Same infrastructure as `bun run e2e` (PGLite + Celestia + Midnight + contract
 * deploy + sync node) but stays up until Ctrl+C instead of running tests.
 *
 * Pass `--celestia-mainnet` to skip the local Celestia devnet and point the
 * node at Celestia Mainnet Beta via a locally-running light node. The light
 * node must already be running on CELESTIA_RPC_URL (default
 * http://127.0.0.1:26658) and CELESTIA_AUTH_TOKEN must be set to its admin JWT.
 */
import path from "path";
import {
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
} from "@e2e-v2/engine";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

const useCelestiaMainnet = process.argv.includes("--celestia-mainnet");

let shuttingDown = false;
async function shutdown(code = 0): Promise<never> {
  if (shuttingDown) process.exit(code);
  shuttingDown = true;
  try {
    await stopInfrastructure();
  } catch (e) {
    console.error("shutdown error:", e);
  }
  process.exit(code);
}

process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down…");
  shutdown(0);
});
process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down…");
  shutdown(0);
});

async function probeMainnetLightNode(): Promise<void> {
  const rpcUrl = process.env["CELESTIA_RPC_URL"] ?? "http://127.0.0.1:26658";
  const token = process.env["CELESTIA_AUTH_TOKEN"];
  if (!token) {
    throw new Error(
      "CELESTIA_AUTH_TOKEN is required in --celestia-mainnet mode. Generate one with:\n" +
        "  celestia light auth admin --p2p.network celestia\n" +
        "then export it before running dev.",
    );
  }
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const rpc = async (method: string, params: unknown[] = []) => {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
      return json.result;
    };

    const head = await rpc("header.NetworkHead");
    const height = parseInt(head.header.height, 10);
    const address: string = await rpc("state.AccountAddress");
    let balanceTia = "unknown";
    try {
      const bal = await rpc("state.Balance");
      // Balance is returned in utia (1 TIA = 1_000_000 utia).
      const utia = BigInt(bal.amount ?? bal.Amount ?? "0");
      balanceTia = (Number(utia) / 1_000_000).toFixed(6);
    } catch { /* optional */ }

    const banner = "═".repeat(72);
    console.log(`\n${banner}`);
    console.log(`[Celestia mainnet] Light node reachable at ${rpcUrl}`);
    console.log(`  Head height : ${height}`);
    console.log(`  Wallet addr : ${address}`);
    console.log(`  Balance     : ${balanceTia} TIA`);
    console.log(`  → Send real TIA to the wallet address above to fund blob submissions.`);
    console.log(`${banner}\n`);
  } catch (e) {
    throw new Error(
      `Cannot reach Celestia light node at ${rpcUrl}. Start it with:\n` +
        "  celestia light start --core.ip <consensus-rpc> --core.port 9090 --core.tls --p2p.network celestia\n" +
        `Underlying error: ${(e as Error).message}`,
    );
  }
}

async function main() {
  try {
    if (useCelestiaMainnet) {
      console.log("Mode: --celestia-mainnet (skipping local Celestia devnet)");
      await probeMainnetLightNode();
    }

    const extraEnv = useCelestiaMainnet ? { CELESTIA_NETWORK: "mainnet" } : {};

    await startInfrastructure(LAUNCHER_PATH, [], extraEnv);
    await waitForOrchestrator();

    if (!useCelestiaMainnet) {
      await waitForProcess("celestia-bridge-wait", { waitForExit: true, timeoutMs: 180_000 });
      await waitForProcess("celestia-fund-bridge", { waitForExit: true, timeoutMs: 60_000 });
      console.log("Celestia infrastructure ready.");
    }

    await waitForProcess("midnight-node-wait", { waitForExit: true, timeoutMs: 120_000 });
    await waitForProcess("midnight-indexer-wait", { waitForExit: true, timeoutMs: 120_000 });
    await waitForProcess("midnight-proof-server-wait", { waitForExit: true, timeoutMs: 120_000 });
    console.log("Midnight infrastructure ready.");

    await waitForProcess("midnight-contract-deploy", { waitForExit: true, timeoutMs: 300_000 });
    console.log("Offer-files contract deployed.");

    await waitForProcess("sync");
    await waitForHealth();
    console.log("\nDev stack is up. Sync node API: http://localhost:9999");
    console.log("Press Ctrl+C to stop.\n");

    // Keep the process alive until a signal triggers shutdown.
    await new Promise<void>(() => {});
  } catch (e) {
    console.error(e);
    await shutdown(1);
  }
}

main();
