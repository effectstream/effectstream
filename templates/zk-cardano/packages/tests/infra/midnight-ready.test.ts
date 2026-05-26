import { assert } from "../helpers.ts";

export async function midnightReadyTest() {
  await assert("Midnight indexer responds", async () => {
    const res = await fetch("http://localhost:8088/api/v3/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    return res.ok;
  });

  await assert("Ballot contract deployed", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const contractDir = path.resolve(import.meta.dirname!, "../../../packages/contracts-midnight");
    const files = fs.readdirSync(contractDir);
    return files.some((f: string) => f.startsWith("contract-ballot.") && f.endsWith(".json"));
  });
}
