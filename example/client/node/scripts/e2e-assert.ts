import type { Pool, QueryResult } from "npm:pg";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let testCount = 1;
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
  console.log(
    `%c🔍 [Running test] ${testCount++}: ${testName}`,
    "color: green; background-color: black; font-weight: bold",
  );
  let maxMillis = 10000;
  while (maxMillis > 0) {
    const res = await db.query(query);

    // First wait until the data is available.
    if (!waitUntil(res)) {
      await delay(100);
      maxMillis -= 100;
      if (maxMillis <= 0) {
        console.error("Data in DB:", res.rows);
        console.error(`❌ Test failed`);
        return res;
      }
      continue;
    }

    // Now run the custom check.
    try {
      if (!check(res)) {
        throw new Error("CHECK_ERROR");
      }
      console.log(`✅ Test passed`);
      return res;
    } catch (e) {
      console.error("Data in DB:", res.rows);
      console.error(`❌ Test failed`);
      if (e instanceof Error && e.message !== "CHECK_ERROR") {
        console.error(e);
      }
      break;
    }
  }
}
