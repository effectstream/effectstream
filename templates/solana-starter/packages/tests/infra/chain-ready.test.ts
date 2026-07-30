import { assert } from "../helpers.ts";
import { COUNTER_PROGRAM_ID } from "@solana-starter/contracts-solana";

const RPC_URL = "http://localhost:8899";

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

export async function chainReadyTest() {
  await assert("Solana validator responds to getHealth", async () => {
    const result = await rpc("getHealth");
    return result === "ok";
  });

  await assert("Counter program is loaded at COUNTER_PROGRAM_ID", async () => {
    const result = await rpc("getAccountInfo", [
      COUNTER_PROGRAM_ID,
      { encoding: "base64" },
    ]);
    // Programs on Solana are stored as executable accounts. A loaded program
    // has a non-null value with the `executable` flag set.
    return result?.value != null && result.value.executable === true;
  });

  await assert("Batcher wallet received the airdrop", async () => {
    // Read from the well-known batcher keypair address ( see
    // packages/batcher/keypair/batcher-wallet.json ).
    const BALANCE_ADDR = "3oFfnPdVbZZRapZTLgZ1ZDCmdf4YjGMpzDgukoWYpXqW";
    // Use "processed" commitment — solana-test-validator's finalized slot
    // lags way behind on a fresh chain ( takes ~30 slots to finalize ),
    // so the airdrops land in "processed" / "confirmed" state but not yet
    // in "finalized" by the time the test runs.
    const result = await rpc("getBalance", [
      BALANCE_ADDR,
      { commitment: "processed" },
    ]);
    const lamports: number = result?.value ?? 0;
    return lamports > 0;
  });
}
