/**
 * 
 * This script is used to wait for a specific block to be mined.
 * This allows other processes to be coordinated to start only after a specific block is completed.
 * 
 * Usage:
 *  deno run -A wait-for-block.ts --block-height 100
 */

// Helper function to make Bitcoin RPC calls
const bitcoinRpcCall = async (
  method: string,
  params: any[] = [],
  walletName?: string
) => {
  // console.log('Calling RPC method:', method);
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
    const blockhash = await bitcoinRpcCall("getbestblockhash", []);
    const block = await bitcoinRpcCall("getblock", [blockhash]);
    if (block.height > targetBlock) {
      return;
    }
    console.log(`Waiting for block: ${targetBlock}. Current block: ${block.height}`);
    await delay(500);
  }
}

if (import.meta.main) {
  await waitForBlock(100);
  process.exit(0);
}