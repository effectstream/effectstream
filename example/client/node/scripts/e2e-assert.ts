import type { Pool, QueryResult } from "npm:pg";
import { ENV } from "@paima/utils";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const testResults = {
  count: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
};

export function printSummary() {
  console.log(`\n\n🔍 [Summary]`);
  console.log(`  ${testResults.passed} tests passed`);
  console.log(`  ${testResults.failed} tests failed`);
  console.log(`  ${testResults.skipped} tests skipped`);
}

function testPassed() {
  testResults.passed++;
  console.log(`✅ Test passed`);
}

function testFailed() {
  testResults.failed++;
  console.log(`❌ Test failed`);
}

function testSkipped() {
  testResults.skipped++;
  console.log(`⏭️ Test skipped`);
}

function startTest(testName: string) {
  console.log(
    `%c🔍 [Running test] ${testResults.count + 1}: ${testName}`,
    "color: green; background-color: black; font-weight: bold",
  );
  testResults.count++;
}

export async function assert(
  testName: string,
  check: () => Promise<boolean>,
): Promise<boolean> {
  startTest(testName);
  try {
    const result = await check();
    if (!result) {
      testFailed();
    }
    testPassed();
    return result;
  } catch (e) {
    testFailed();
    console.error("[ERROR]", e);
    return false;
  }
}

// Run a query, as we don't know when the Paima Engine chain has
// included and processed the data, we run a query until some
// condition is met, then we chech against the expected data.
export async function assertSQL(
  testName: string,
  db: Pool,
  query: string,
  waitUntil: (res: QueryResult<any>) => boolean,
  check: (res: QueryResult<any>) => boolean,
): Promise<QueryResult<any>> {
  startTest(testName);
  let maxMillis = 10000;
  while (maxMillis > 0) {
    let res;
    let didLock = false;
    try {
      await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/db_aquire_lock`);
      didLock = true;
      res = await db.query(query);
    } finally {
      if (didLock) {
        await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/db_release_lock`);
      }
    }

    // First wait until the data is available.
    if (!waitUntil(res)) {
      await delay(100);
      maxMillis -= 100;
      if (maxMillis <= 0) {
        testFailed();
        console.error("[TIMEOUT] Data in DB:", res.rows);
        return res;
      }
      continue;
    }

    // Now run the custom check.
    try {
      if (!check(res)) {
        throw new Error("CHECK_ERROR");
      }
      testPassed();
      return res;
    } catch (e) {
      testFailed();
      console.error("[CHECK_ERROR] Data in DB:", res.rows);
      if (e instanceof Error && e.message !== "CHECK_ERROR") {
        console.error(e);
      }
      break;
    }
  }
}
