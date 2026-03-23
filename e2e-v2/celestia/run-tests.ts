/**
 * Celestia E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + Celestia node + bridge + fund + sync node)
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

  await assert("Celestia consensus node is responding on port 26657", async () => {
    const res = await fetch("http://localhost:26657/status");
    const json = await res.json() as any;
    return json.result?.node_info != null;
  });

  await assert("Celestia bridge node is responding on port 26658", async () => {
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

  // Verify the STM wrote the blob content into celestia_blobs table
  await assertSQL<{ content: string }>(
    "Celestia: celestia_blobs table has submitted blob content",
    db,
    `SELECT content FROM celestia_blobs LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows[0] as any;
      return row?.content === testData;
    },
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    // 2. Wait for celestia infrastructure to be ready
    await waitForProcess("celestia-bridge-wait", { waitForExit: true, timeoutMs: 180_000 });
    await waitForProcess("celestia-fund-bridge", { waitForExit: true, timeoutMs: 60_000 });
    console.log("Celestia infrastructure ready.\n");

    // 3. Run tooling tests
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
