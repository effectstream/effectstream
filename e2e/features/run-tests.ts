/**
 * Feature tests runner.
 * Reuses the EVM infrastructure (hardhat + sync + batcher).
 * Tests: API endpoints, RPC, Accounts, Migrations.
 */
import {
  anyError,
  printSummary,
  newSharedState,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  waitForBlock,
  getDBConnection,
  API_PORT,
} from "@e2e/engine";
import path from "path";

const LAUNCHER = path.resolve(import.meta.dirname!, "../evm/launcher.cli.ts");

async function test() {
  let db: ReturnType<typeof getDBConnection> | null = null;
  try {
    // ── MQTT tests (standalone, no chain infra needed) ──────────────────
    console.log("\n--- MQTT Tests ---\n");
    const { mqttTest } = await import("./mqtt/mqtt.test.ts");
    await mqttTest();

    // ── pgtyped tests (standalone PGLite, must run before infra claims port 5432)
    console.log("\n--- pgtyped:update Tests ---\n");
    const { pgtypedTest } = await import("./pgtyped/run-tests.ts");
    await pgtypedTest();

    await startInfrastructure(LAUNCHER);
    await waitForOrchestrator();
    await waitForProcess("generate-evm-mod", { waitForExit: true });
    await waitForProcess("sync");
    await waitForProcess("batcher");
    await waitForHealth();
    await waitForBlock(1);
    console.log("Infrastructure ready.\n");

    db = getDBConnection();
    const sharedState = newSharedState();

    // ── API tests ────────────────────────────────────────────────────────────
    console.log("\n--- API Tests ---\n");
    const { healthTest } = await import("./api/health.test.ts");
    const { rpcTest } = await import("./api/rpc.test.ts");
    const { dbLockTest } = await import("./api/db-lock.test.ts");
    const { tableApiTest } = await import("./api/table-api.test.ts");
    await healthTest(API_PORT);
    await dbLockTest(API_PORT);
    await tableApiTest(API_PORT);
    await rpcTest(API_PORT);

    // ── Migration tests ──────────────────────────────────────────────────────
    console.log("\n--- Migration Tests ---\n");
    const { migrationTest } = await import("./migrations/migration.test.ts");
    await migrationTest(db);

    // ── Account tests ────────────────────────────────────────────────────────
    console.log("\n--- Account Tests ---\n");
    const { accountTest } = await import("./accounts/account.test.ts");
    await accountTest(db, sharedState, API_PORT);

    // ── Snapshot tests (opt-in via EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS) ───
    console.log("\n--- Snapshot Tests ---\n");
    const { snapshotTest, snapshotRetentionTest } = await import(
      "./snapshots/snapshot.test.ts"
    );
    await snapshotTest(db);
    await snapshotRetentionTest(db);

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
