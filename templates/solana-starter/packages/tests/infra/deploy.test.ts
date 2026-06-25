import { assert } from "../helpers.ts";
import { COUNTER_PROGRAM_ID } from "@solana-starter/contracts-solana";

const RPC_URL = "http://localhost:8899";

/**
 * Phase A "deploy" test — verifies the counter program is loaded and
 * executable. For local dev, "deploy" is actually `--bpf-program` on the
 * test-validator cmdline ( see packages/node/chain-start.ts ); for mainnet
 * it would be `solana program deploy`. The assertion is the same property
 * either way: the program exists at COUNTER_PROGRAM_ID.
 */
export async function deployTest() {
  await assert("Counter program is owned by BPF loader and executable", async () => {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [
          COUNTER_PROGRAM_ID,
          { encoding: "base64", commitment: "processed" },
        ],
      }),
    });
    const json = await res.json();
    const acct = json?.result?.value;
    // Program accounts are owned by the BPF loader program
    // ( BPFLoaderUpgradeab1e11111111111111111111111 or
    //   BPFLoader2111111111111111111111111111111111 ) and have the
    //   executable flag set.
    return (
      acct?.executable === true &&
      typeof acct?.owner === "string" &&
      acct.owner.startsWith("BPFLoader")
    );
  });
}
