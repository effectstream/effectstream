const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;

export async function assert(name: string, check: () => Promise<boolean>): Promise<void> {
  process.stdout.write(`  [TEST] ${name}...`);
  try {
    if (await check()) {
      console.log(" PASS");
      passCount++;
    } else {
      console.log(" FAIL");
      failCount++;
      throw new Error(`Assertion failed: ${name}`);
    }
  } catch (e) {
    console.log(" FAIL");
    failCount++;
    throw e;
  }
}

export async function assertSQL<T>(
  name: string,
  db: any,
  query: string,
  waitUntil: (res: { rows: T[] }) => boolean,
  check: (res: { rows: T[] }) => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  process.stdout.write(`  [TEST] ${name}...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await db.query(query);
      if (waitUntil(res)) {
        if (check(res)) {
          console.log(" PASS");
          passCount++;
          return;
        } else {
          console.log(" FAIL");
          failCount++;
          throw new Error(`Check failed: ${name}`);
        }
      }
    } catch (e: any) {
      if (e.message?.startsWith("Check failed")) throw e;
    }
    await delay(500);
  }
  console.log(" TIMEOUT");
  failCount++;
  throw new Error(`Timed out waiting: ${name}`);
}

export function printSummary() {
  console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
}

export function anyError() {
  return failCount > 0 || (passCount + failCount) === 0;
}
