import {
  anyError,
  cleanup,
  newSharedState,
  printSummary,
  type SharedState,
  shutdown,
  startup,
} from "@e2e/engine";

import type { Client } from "pg";
import { accountTests } from "../e2e-tests/e2e.account.test.ts";
import { generalTest } from "../e2e-tests/e2e.general.test.ts";
import { joinAndIncrementTest } from "../e2e-tests/e2e.midnight.test.ts";
import { submitDataWithMessageAvailTest } from "../e2e-tests/e2e.avail.test.ts";
import { testMigrations } from "../e2e-tests/e2e.migrations.ts";
import { RPCTest } from "../e2e-tests/e2e.rpc.test.ts";
import { tokenTests } from "../e2e-tests/e2e.tokens.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Start Test
async function test() {
  // Do not use this db connection directly.
  // As PGLite does not support multiple connections.
  let db: Client;
  try {
    // Launch the orchestrator, and wait for the sync process to start.
    // The contracts are deployed with the private key.
    db = await startup();

    const sharedState = newSharedState();
    sharedState.primitive_accounting_counter = 1;

    await generalTest(db, sharedState);
    console.log(
      "generalTest completed",
      sharedState,
    );
    await RPCTest();
    await accountTests(db, sharedState);
    console.log(
      "accountTests completed",
      sharedState,
    );
    await joinAndIncrementTest(db, sharedState);
    await submitDataWithMessageAvailTest(db, sharedState);
    await tokenTests(db, sharedState);
    await testMigrations(db);

    // Done testing.
    printSummary();
    await cleanup(db);

    // Optional pause to allow the user to inspect the DB,
    // check the logs, send more requests, etc.
    const pauseTime = Deno.env.get("PAIMA_E2E_PAUSE_TIME");
    if (pauseTime) {
      console.log("⏳ Pausing for", pauseTime, "seconds");
      await delay(parseInt(pauseTime, 10) * 1000);
    }

    // // Disconnect so the process can exit.
    shutdown();
  } catch (e) {
    // Show partial summary of testing.
    printSummary();

    console.error(e);
    await cleanup(db);
    shutdown();
  } finally {
    if (anyError()) {
      Deno.exit(1);
    }
  }
}

// TODO: We are not able to run this test in
//       as a Deno test as we have some leaks.
//       These leaks are not being cleaned up.
//       We should fix this and then run this
//       test as a Deno test. But they are hard
//       to find.
//
// Deno.test("async test", { sanitizeResources: false }, async () => {
test()
  .then(() => {
    console.log("🎉 Test completed");
    Deno.exit(0);
  }).catch((e) => {
    console.log("❌ Test failed");
    // kill -9 `ps aux | grep deno  | awk '{print $2}' | awk NF=NF RS= OFS=" "`
    console.error(e);
    Deno.exit(1);
  });
// });
