import { assert } from "@e2e/engine";

export async function dbLockTest(apiPort: number) {
  await assert("Can acquire and release DB lock", async () => {
    const acquireRes = await fetch(
      `http://localhost:${apiPort}/db_acquire_lock?name=test-lock`,
    );
    if (!acquireRes.ok) return false;

    const releaseRes = await fetch(
      `http://localhost:${apiPort}/db_release_lock?name=test-lock`,
    );
    return releaseRes.ok;
  });
}
