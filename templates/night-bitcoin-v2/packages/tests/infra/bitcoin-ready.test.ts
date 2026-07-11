import { assert } from "../helpers.ts";

const BITCOIN_RPC_URL = process.env["BITCOIN_RPC_URL"] || "http://localhost:18443/";
const BITCOIN_RPC_USER = process.env["BITCOIN_RPC_USER"] || "dev";
const BITCOIN_RPC_PASSWORD = process.env["BITCOIN_RPC_PASSWORD"] || "devpassword";

function authHeader(): string {
  const creds = `${BITCOIN_RPC_USER}:${BITCOIN_RPC_PASSWORD}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}

async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(BITCOIN_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader(),
    },
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "tests",
      method,
      params,
    }),
  });
  if (!res.ok) throw new Error(`Bitcoin RPC ${method} HTTP ${res.status}`);
  return res.json();
}

export async function bitcoinReadyTest() {
  await assert("Bitcoin Core RPC (port 18443) responds", async () => {
    const json = await rpc("getblockchaininfo");
    return json.result !== undefined && json.result !== null;
  });

  await assert("Bitcoin Core is on regtest chain", async () => {
    const json = await rpc("getblockchaininfo");
    return json.result?.chain === "regtest";
  });

  await assert("Bitcoin Core has at least 1 block (faucet generated)", async () => {
    const json = await rpc("getblockchaininfo");
    return typeof json.result?.blocks === "number" && json.result.blocks >= 1;
  });
}
