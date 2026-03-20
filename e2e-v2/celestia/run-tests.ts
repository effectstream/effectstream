/**
 * Celestia E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + sync node)
 *    NOTE: Celestia Light Node must be running externally on port 26658
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify Celestia node is responding)
 * 4. Runs sync tests (submit blob via RPC, verify primitive_accounting has entry)
 * 5. Shuts down everything
 */
import {
  anyError,
  assert,
  assertSQL,
  printSummary,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  getDBConnection,
} from "@e2e-v2/engine";
import type { Client } from "pg";
import path from "path";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");
const CELESTIA_NAMESPACE = "000000000000deadbeef";

// ── Celestia blob submission helpers ─────────────────────────────────────────

/**
 * Convert a hex namespace to base64-encoded 29-byte Celestia namespace ID.
 * Celestia v0 namespaces are 29 bytes: zero-padded on the left.
 */
function celestiaNamespaceBase64(hex: string): string {
  const buffer = Buffer.alloc(29);
  const hexBuffer = Buffer.from(hex, "hex");
  hexBuffer.copy(buffer, 29 - hexBuffer.length);
  return buffer.toString("base64");
}

/**
 * Submit a blob to Celestia via the blob.Submit JSON-RPC method.
 */
async function celestiaSubmitBlob(data: string): Promise<number> {
  const b64 = Buffer.from(data).toString("base64");
  const ns = celestiaNamespaceBase64(CELESTIA_NAMESPACE);
  const res = await fetch("http://localhost:26658", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "blob.Submit",
      params: [
        [{ namespace: ns, data: b64, share_version: 0 }],
        { fee: 2000, gasLimit: 100000 },
      ],
    }),
  });
  const json = await res.json() as any;
  if (json.error) {
    throw new Error(`blob.Submit error: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

// ── Tooling tests ────────────────────────────────────────────────────────────

async function runToolingTests(): Promise<void> {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  // Verify Celestia light node is responding on port 26658
  await assert("Celestia light node is responding on http://localhost:26658", async () => {
    const response = await fetch("http://localhost:26658", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "header.NetworkHead",
        params: [],
      }),
    });
    const json = await response.json() as any;
    // NetworkHead returns a header result on success
    return json.result !== undefined || json.error === undefined;
  });
}

// ── Sync tests ───────────────────────────────────────────────────────────────

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");

  // Submit a blob to Celestia
  const testData = JSON.stringify({ message: "TestCelestia" });
  console.log(`Submitting blob to Celestia: ${testData}`);
  const blobHeight = await celestiaSubmitBlob(testData);
  console.log(`Blob submitted successfully at height: ${blobHeight}`);

  // Wait for sync to pick up the blob and verify primitive_accounting has a CelestiaBlob entry
  await assertSQL<{ primitive_name: string }>(
    "Celestia: primitive_accounting has CelestiaBlob entry",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting WHERE primitive_name = 'CelestiaBlob' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => r.primitive_name === "CelestiaBlob");
      return row != null;
    },
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure (Celestia node must already be running externally)
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    // 2. Wait for user tables to be created
    await waitForProcess("create-user-tables", { waitForExit: true });
    console.log("User tables created.\n");

    // 3. Run tooling tests (verify Celestia node responding)
    await runToolingTests();

    // 4. Wait for sync node to be healthy
    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node is healthy.\n");

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await runSyncTests(db);

    // 6. Summary
    printSummary();
  } catch (e) {
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfrastructure();
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

test();
