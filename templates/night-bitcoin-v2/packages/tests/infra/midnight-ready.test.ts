import { assert } from "../helpers.ts";

export async function midnightReadyTest() {
  await assert("Midnight node (port 9944) responds", async () => {
    const res = await fetch("http://localhost:9944", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "system_health", params: [] }),
    });
    const json = await res.json() as any;
    return json.result !== undefined;
  });

  await assert("Midnight indexer (port 8088) responds", async () => {
    const res = await fetch("http://localhost:8088/api/v3/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    return res.ok;
  });

  await assert("Midnight proof server (port 6300) responds", async () => {
    const res = await fetch("http://localhost:6300/health");
    return res.ok;
  });
}
