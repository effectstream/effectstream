/**
 *  This script waits for a specific block to be mined.
 *  Usage:
 *  bun run wait-for-block.ts 100
 *
 *  Arguments:
 *  - 1. Block height to wait for (default: 100)
 */

const bitcoinRpcCall = async (
  method: string,
  params: any[] = [],
  walletName?: string
) => {
  const url = walletName
    ? `http://127.0.0.1:18443/wallet/${walletName}`
    : "http://127.0.0.1:18443";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa("dev:devpassword"),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RPC call failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }
  return data.result;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForBlock(targetBlock: number) {
  while (true) {
    try {
      const blockhash = await bitcoinRpcCall("getbestblockhash", []);
      const block = await bitcoinRpcCall("getblock", [blockhash]);
      if (block.height > targetBlock) {
        return;
      }
      console.log(`Waiting for block: ${targetBlock}. Current block: ${block.height}`);
    } catch (e) {
      // bitcoind rejects RPC while starting up (-28 "Loading block index…",
      // connection refused) — keep polling; the orchestrator owns the timeout.
      console.log(`Waiting for bitcoind: ${e instanceof Error ? e.message : e}`);
    }
    await delay(500);
  }
}

if (import.meta.main) {
  const targetBlock = process.argv[2] ? parseInt(process.argv[2]!) : 100;
  await waitForBlock(targetBlock);
  process.exit(0);
}
