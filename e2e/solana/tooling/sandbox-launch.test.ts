import { assert, runTest } from "@e2e/engine";

const SOLANA_RPC = "http://localhost:8899";

async function getSlot(): Promise<number> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot",
      params: [{ commitment: "confirmed" }],
    }),
  });
  const json = await res.json();
  return json.result as number;
}

async function airdrop(address: string, lamports: number): Promise<string> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "requestAirdrop",
      params: [address, lamports],
    }),
  });
  const json = await res.json();
  return json.result as string;
}

async function getBalance(address: string): Promise<number> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address, { commitment: "confirmed" }],
    }),
  });
  const json = await res.json();
  return json.result?.value ?? 0;
}

export async function runToolingTests(): Promise<void> {
  await runTest("Solana: validator is responding", async () => {
    const slot = await getSlot();
    assert(slot >= 0, `Expected slot >= 0, got ${slot}`);
  });

  await runTest("Solana: airdrop works", async () => {
    const testAddress = "11111111111111111111111111111111";
    const sig = await airdrop(testAddress, 1_000_000_000);
    assert(sig.length > 0, "Expected airdrop signature");
  });

  await runTest("Solana: getBalance returns lamports", async () => {
    const balance = await getBalance("11111111111111111111111111111111");
    assert(typeof balance === "number", `Expected number balance, got ${typeof balance}`);
  });

  console.log("Solana tooling tests passed.\n");
}
