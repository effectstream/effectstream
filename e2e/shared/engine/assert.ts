import type { QueryResult } from "./db.ts";
import { safeQuery } from "./db.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getMaxTimeout = (): number => {
  const envVal = process.env["E2E_MAX_TIMEOUT"];
  return envVal ? parseInt(envVal, 10) : 20000;
};

const testResults = {
  count: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
};

export function printSummary() {
  console.log(`\n\n[Summary]`);
  console.log(`  ${testResults.passed} tests passed`);
  console.log(`  ${testResults.failed} tests failed`);
  console.log(`  ${testResults.skipped} tests skipped`);
}

export function anyError(): boolean {
  return testResults.count === 0 || testResults.failed > 0;
}

export function hasPassedTests(): boolean {
  return testResults.passed > 0;
}

let isRunning = false;

function testPassed() {
  testResults.passed++;
  isRunning = false;
  console.log(`[PASS] Test passed`);
}

function testFailed() {
  testResults.failed++;
  isRunning = false;
  console.log(`[FAIL] Test failed`);
}

function testSkipped() {
  testResults.skipped++;
  isRunning = false;
  console.log(`[SKIP] Test skipped`);
}

function startTest(testName: string) {
  if (isRunning) {
    throw new Error("Test already running");
  }
  isRunning = true;
  console.log(`[Running test] ${testResults.count + 1}: ${testName}`);
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

export async function assertSQL<RowType>(
  testName: string,
  db: any,
  query: string,
  waitUntil: (res: QueryResult<RowType>) => boolean,
  check: (res: QueryResult<RowType>) => boolean,
): Promise<QueryResult<RowType>> {
  startTest(testName);
  let remainingTime = getMaxTimeout();
  const retryDelay = 200;

  while (remainingTime > 0) {
    const res = await safeQuery<RowType>(db, query, testName);

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

export async function assertSQL2<WaitType, CheckType>(
  testName: string,
  db: any,
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

export async function assertRPC(
  testName: string,
  url: string,
  check: (data: any) => boolean,
): Promise<boolean> {
  startTest(testName);
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!check(data)) {
      testFailed();
      console.error("[RPC] Response:", data);
      return false;
    }
    testPassed();
    return true;
  } catch (e) {
    testFailed();
    console.error("[ERROR]", e);
    return false;
  }
}

export async function assertChainReady(
  testName: string,
  healthUrl: string,
  timeoutMs: number = 30000,
): Promise<boolean> {
  startTest(testName);
  const retryDelay = 500;
  let remainingTime = timeoutMs;

  while (remainingTime > 0) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        testPassed();
        return true;
      }
    } catch {
      // not ready yet
    }
    await delay(retryDelay);
    remainingTime -= retryDelay;
  }
  testFailed();
  console.error("[TIMEOUT] Chain not ready at", healthUrl);
  return false;
}
