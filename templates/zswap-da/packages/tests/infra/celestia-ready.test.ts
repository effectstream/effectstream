import { assert } from "../helpers.ts";

export async function celestiaReadyTest(): Promise<void> {
  await assert("Celestia consensus node responds on 26657", async () => {
    const res = await fetch("http://localhost:26657/status");
    const json = (await res.json()) as any;
    return json.result?.node_info != null;
  });

  await assert("Celestia bridge node responds on 26658", async () => {
    const res = await fetch("http://localhost:26658", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "header.NetworkHead",
        params: [],
      }),
    });
    const json = (await res.json()) as any;
    return json.result !== undefined || json.error === undefined;
  });
}
