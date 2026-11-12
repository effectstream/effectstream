/**
 * Celestia E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator/cli.ts (DB + Celestia node + bridge + fund + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify Celestia node is responding)
 * 4. Runs sync tests (submit blob via RPC, verify primitive_accounting holds its reference)
 * 5. Shuts down everything
 */
import {
  anyError,
  assert,
  assertSQL,
  printSummary,
  recordCrash,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  waitForBlock,
  getDBConnection,
} from "@e2e/engine";
import type { Client } from "pg";
import path from "path";
import fs from "fs";

// ── Preflight: verify celestia-appd binary is runnable on this system ────────
// If the binary doesn't exist (e.g. CI), skip the check and let tests run.
// Only skip tests when the binary exists but isn't runnable (wrong arch, etc.).

const celestiaAppd = path.resolve(import.meta.dirname!, "../../packages/binaries/celestia/vendor/celestia-appd");
{
  if (fs.existsSync(celestiaAppd)) {
    const check = Bun.spawnSync([celestiaAppd, "version"], { stdout: "pipe", stderr: "pipe" });
    if (check.exitCode !== 0) {
      console.log(`[SKIP] Celestia tests skipped: celestia-appd binary is not runnable on this system\n  ${check.stderr.toString().trim()}`);
      process.exit(0);
    }
  }
}

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

/**
 * Fetch one blob via the blob.Get JSON-RPC method and return its body.
 */
async function celestiaGetBlob(
  height: number,
  namespaceHex: string,
  commitment: string,
): Promise<string> {
  const res = await fetch("http://localhost:26658", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "blob.Get",
      params: [height, celestiaNamespaceBase64(namespaceHex), commitment],
    }),
  });
  const json = await res.json() as any;
  if (json.error) {
    throw new Error(`blob.Get error: ${JSON.stringify(json.error)}`);
  }
  return Buffer.from(json.result.data, "base64").toString();
}

/** The fields a CelestiaBlob accounting row holds by default. */
type CelestiaBlobReference = {
  namespace: string;
  commitment: string;
  blobIndex: number;
  height: number;
};

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

  // Wait for sync to pick up the blob. By default its accounting row is the
  // blob reference only: no body, and the Celestia height it was included at.
  const accounting = await assertSQL<
    { payload: { payload: Record<string, unknown> } }
  >(
    "Celestia: CelestiaBlob row holds the blob reference and no body",
    db,
    `SELECT payload::jsonb AS payload FROM effectstream.primitive_accounting WHERE primitive_name = 'CelestiaBlob' ORDER BY id LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const reference = res.rows[0]?.payload?.payload;
      if (reference == null) return false;
      const keys = Object.keys(reference).sort().join(",");
      return keys === "blobIndex,commitment,height,namespace" &&
        reference.namespace === CELESTIA_NAMESPACE &&
        typeof reference.commitment === "string" &&
        reference.commitment.length > 0 &&
        Number.isInteger(reference.blobIndex) &&
        reference.height === blobHeight;
    },
  );

  // The reference is the blob.Get key: it fetches the submitted body back.
  const reference = accounting.rows[0]?.payload?.payload as
    | CelestiaBlobReference
    | undefined;
  await assert(
    "Celestia: blob.Get with the row's height, namespace and commitment returns the blob",
    async () => {
      if (reference == null) return false;
      const body = await celestiaGetBlob(
        reference.height,
        reference.namespace,
        reference.commitment,
      );
      return body === testData;
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
    await waitForBlock(1);
    console.log("Sync node is healthy.\n");

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await runSyncTests(db);

    // 6. Summary
    printSummary();
  } catch (e) {
    recordCrash();
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
