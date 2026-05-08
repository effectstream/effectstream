/**
 * Tooling tests: verify NEAR sandbox infrastructure is operational.
 *
 * These are extracted from run-tests.ts inline tests for future modularity.
 */
import { assert } from "@e2e/engine";

export async function runToolingTests(): Promise<void> {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  await assert("NEAR sandbox is responding on port 3030", async () => {
    const res = await fetch("http://localhost:3030/status");
    const json = await res.json() as any;
    return json.version?.version != null;
  });

  await assert("NEAR sandbox is producing blocks", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await fetch("http://localhost:3030", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "block",
          params: { finality: "final" },
        }),
      });
      const json = await res.json() as any;
      if (json.result?.header?.height > 1) return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  });
}
