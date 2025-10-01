import type { Pool } from "pg";
import { type QueryResult, safeQuery } from "./e2e-db.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getMaxTimeout = (): number => {
  if (Deno.env.get("E2E_MAX_TIMEOUT")) {
    return parseInt(Deno.env.get("E2E_MAX_TIMEOUT")!, 10);
  }
  return 20000;
};

const testResults = {
  count: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
};

/** Print a summary of the test results. */
export function printSummary() {
  console.log(`\n\n🔍 [Summary]`);
  console.log(`  ${testResults.passed} tests passed`);
  console.log(`  ${testResults.failed} tests failed`);
  console.log(`  ${testResults.skipped} tests skipped`);
}

export function anyError(): boolean {
  return testResults.count === 0 || testResults.failed > 0;
}

let isRunning = false;

/** Increment the passed test count and print a success message. */
function testPassed() {
  testResults.passed++;
  isRunning = false;
  console.log(`✅ Test passed`);
}

/** Increment the failed test count and print a failure message. */
function testFailed() {
  testResults.failed++;
  isRunning = false;
  console.log(`❌ Test failed`);
}

/** Increment the skipped test count and print a skipped message. */
function testSkipped() {
  testResults.skipped++;
  isRunning = false;
  console.log(`⏭️ Test skipped`);
}

/** Increment the test count and print the test name. */
function startTest(testName: string) {
  if (isRunning) {
    // By default only one test can run at a time.
    throw new Error("Test already running");
  }
  isRunning = true;
  console.log(
    `%c🔍 [Running test] ${testResults.count + 1}: ${testName}`,
    "color: green; background-color: black; font-weight: bold",
  );
  testResults.count++;
}

/**
 * Run a test and check the result.
 * @param testName - The name of the test.
 * @param check - The function to check the result. IMPORTANT: if it returns falsy, or throws an error, the test will be marked as failed.
 * @returns The result of the check function if passed, false otherwise.
 */
export async function assert(
  testName: string,
  check: () => Promise<boolean>,
): Promise<boolean> {
  startTest(testName);
  try {
    const result = await check();
    if (!result) {
      testFailed();
      return false;
    }
    testPassed();
    return result;
  } catch (e) {
    testFailed();
    console.error("[ERROR]", e);
    return false;
  }
}

/**
 * Run Assert as a SQL query.
 * As we don't know when the Paima Engine chain has
 * included and processed the data, we run a "waitUntil" query until some
 * condition is met, then we chech against the expected data.
 * @param testName - The name of the test.
 * @param db - The database connection.
 * @param query - The query to run.
 * @param waitUntil - The function to check if the data is available. Will retry until it returns true.
 * @param check - The function to check the result. IMPORTANT: if it returns falsy, or throws an error, the test will be marked as failed.
 * @returns The result of the query.
 */
export async function assertSQL<RowType>(
  testName: string,
  db: Pool,
  query: string,
  waitUntil: (res: QueryResult<RowType>) => boolean,
  check: (res: QueryResult<RowType>) => boolean,
): Promise<QueryResult<RowType>> {
  startTest(testName);
  let remainingTime = getMaxTimeout();
  const retryDelay = 200;

  while (remainingTime > 0) {
    const res = await safeQuery<RowType>(db, query, testName);

    // First wait until the data is available.
    if (!waitUntil(res)) {
      await delay(retryDelay);
      remainingTime -= retryDelay;
      if (remainingTime <= 0) {
        testFailed();
        console.log("Expected (waitUntil)", waitUntil.toString());
        console.error("[TIMEOUT] Data in DB:", res.rows);
        return res;
      }
      continue;
    }

    // Now run the custom check.
    try {
      const finalResult: QueryResult<RowType> = await safeQuery<RowType>(
        db,
        query,
        testName,
      );
      if (!check(finalResult)) {
        throw new Error("CHECK_ERROR");
      }
      testPassed();
      return finalResult;
    } catch (e) {
      testFailed();
      console.error("[CHECK_ERROR] Data in DB:", res.rows);
      if (e instanceof Error && e.message !== "CHECK_ERROR") {
        console.error(e);
      }
      return res;
    }
  }
  console.error("[TIMEOUT] Data in DB");
  return {
    rows: [],
    fields: [],
    rowCount: 0,
    command: "",
    oid: 0,
    rowsAffected: 0,
  } as QueryResult<RowType>;
}

/**
 * Run Assert as a SQL query.
 * As we don't know when the Paima Engine chain has
 * included and processed the data, we run a "waitUntil" query until some
 * condition is met, then we chech against the expected data.
 * @param testName - The name of the test.
 * @param db - The database connection.
 * @param query - The query to run.
 * @param waitUntil - The function to check if the data is available. Will retry until it returns true.
 * @param check - The function to check the result. IMPORTANT: if it returns falsy, or throws an error, the test will be marked as failed.
 * @returns The result of the query.
 */
export async function assertSQL2<WaitType, CheckType>(
  testName: string,
  db: Pool,
  waitUntil: { query: string; check: (res: QueryResult<WaitType>) => boolean },
  check: { query: string; check: (res: QueryResult<CheckType>) => boolean },
): Promise<QueryResult<WaitType | CheckType>> {
  startTest(testName);
  const retryDelay = 200;

  let remainingTime = getMaxTimeout();
  while (remainingTime > 0) {
    const waitUntilResult = await safeQuery<WaitType>(
      db,
      waitUntil.query,
      testName,
    );

    // First wait until the data is available.
    if (!waitUntil.check(waitUntilResult)) {
      await delay(retryDelay);
      remainingTime -= retryDelay;
      if (remainingTime <= 0) {
        testFailed();
        console.log("Expected", waitUntil.toString());
        console.error("[TIMEOUT] Data in DB:", waitUntilResult.rows);
        return waitUntilResult;
      }
      continue;
    }

    const checkResult = await safeQuery<CheckType>(db, check.query, testName);

    // Now run the custom check.
    try {
      if (!check.check(checkResult)) {
        throw new Error("CHECK_ERROR");
      }
      testPassed();
      return checkResult;
    } catch (e) {
      testFailed();
      console.error("[CHECK_ERROR] Data in DB:", checkResult.rows);
      if (e instanceof Error && e.message !== "CHECK_ERROR") {
        console.error(e);
      }
      return checkResult;
    }
  }
  console.error("[TIMEOUT] Data in DB");
  return {
    rows: [],
    fields: [],
    rowCount: 0,
    command: "",
    oid: 0,
    rowsAffected: 0,
  } as QueryResult<WaitType | CheckType>;
}
