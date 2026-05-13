import { assert } from "../helpers.ts";

export async function midnightReadyTest(): Promise<void> {
  await assert("Midnight node responds on 9944", async () => {
    const res = await fetch("http://localhost:9944", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "system_health",
        params: [],
      }),
    });
    const json = (await res.json()) as any;
    return json.result != null;
  });

  await assert("Midnight indexer responds on 8088", async () => {
    const res = await fetch("http://localhost:8088/api/v3/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    return res.ok;
  });
}
