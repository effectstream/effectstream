/**
 * ZSwap-DA dev runner.
 *
 * Same infrastructure as `bun run e2e` (PGLite + Celestia + Midnight + contract
 * deploy + sync node) but stays up until Ctrl+C instead of running tests.
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

async function main() {
  try {
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    await waitForProcess("celestia-bridge-wait", { waitForExit: true, timeoutMs: 180_000 });
    await waitForProcess("celestia-fund-bridge", { waitForExit: true, timeoutMs: 60_000 });
    console.log("Celestia infrastructure ready.");

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
