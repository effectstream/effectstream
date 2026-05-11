import type { Client } from "pg";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getMaxTimeout = (): number => {
  const envVal = process.env["E2E_MAX_TIMEOUT"];
  return envVal ? parseInt(envVal, 10) : 20000;
};

const testResults = {
  count: 0,
  passed: 0,
  failed: 0,
};

export function printSummary() {
  console.log(`\n[Summary]`);
  console.log(`  ${testResults.passed} tests passed`);
  console.log(`  ${testResults.failed} tests failed`);
}

export function anyError(): boolean {
  return testResults.count === 0 || testResults.failed > 0;
}

function startTest(testName: string) {
  console.log(`[Running] ${testResults.count + 1}: ${testName}`);
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
      testResults.failed++;
      console.log(`[FAIL] ${testName}`);
      return false;
    }
    testResults.passed++;
    console.log(`[PASS] ${testName}`);
    return true;
  } catch (e) {
    testResults.failed++;
    console.log(`[FAIL] ${testName}`);
    console.error("[ERROR]", e);
    return false;
  }
}

export async function assertSQL<RowType>(
  testName: string,
  db: Client,
  query: string,
  waitUntil: (rows: RowType[]) => boolean,
  check: (rows: RowType[]) => boolean,
): Promise<RowType[]> {
  startTest(testName);
  let remainingTime = getMaxTimeout();
  const retryDelay = 200;

  while (remainingTime > 0) {
    try {
      const res = await db.query<RowType>(query);
      if (!waitUntil(res.rows)) {
        await delay(retryDelay);
        remainingTime -= retryDelay;
        if (remainingTime <= 0) {
          testResults.failed++;
          console.log(`[FAIL] ${testName} (timeout waiting for data)`);
          console.error("[TIMEOUT] Data in DB:", res.rows);
          return res.rows;
        }
        continue;
      }

      if (!check(res.rows)) {
        testResults.failed++;
        console.log(`[FAIL] ${testName}`);
        console.error("[CHECK_ERROR] Data in DB:", res.rows);
        return res.rows;
      }

      testResults.passed++;
      console.log(`[PASS] ${testName}`);
      return res.rows;
    } catch (e) {
      await delay(retryDelay);
      remainingTime -= retryDelay;
      if (remainingTime <= 0) {
        testResults.failed++;
        console.log(`[FAIL] ${testName} (error)`);
        console.error("[ERROR]", e);
        return [];
      }
    }
  }
  return [];
}
