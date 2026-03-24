/**
 * Create transactions on the YACI DevKit devnet.
 *
 * Uses the YACI Admin API to topup addresses, which creates real on-chain
 * transactions that Dolos indexes and the sync engine captures.
 */

const YACI_ADMIN = "http://localhost:10000";

async function topup(address: string, adaAmount: number): Promise<any> {
  const res = await fetch(`${YACI_ADMIN}/local-cluster/api/addresses/topup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, adaAmount }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Topup failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function waitForYaci(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${YACI_ADMIN}/local-cluster/api/admin/devnet`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("YACI Admin API not ready");
}

async function main() {
  console.log("Waiting for YACI Admin API...");
  await waitForYaci();

  // Use a well-known test address (Shelley enterprise address for protocol magic 42)
  const testAddr =
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";

  console.log(`Using test address: ${testAddr}`);
  console.log("\n--- Submitting topup transactions ---\n");

  const result1 = await topup(testAddr, 1000);
  console.log("TX 1 (1000 ADA):", JSON.stringify(result1));

  await new Promise((r) => setTimeout(r, 2000));

  const result2 = await topup(testAddr, 500);
  console.log("TX 2 (500 ADA):", JSON.stringify(result2));

  await new Promise((r) => setTimeout(r, 2000));

  const result3 = await topup(testAddr, 100);
  console.log("TX 3 (100 ADA):", JSON.stringify(result3));

  // Wait for txs to be included in blocks
  console.log("\nWaiting for blocks to include transactions...");
  await new Promise((r) => setTimeout(r, 5000));

  console.log("Transaction submission complete!");
}

main().catch((e) => {
  console.error("Transaction submission failed:", e);
  process.exit(1);
});
