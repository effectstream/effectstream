const YACI_ADMIN = "http://localhost:10000";

async function topup(address: string, adaAmount: number, retries = 10, delayMs = 3000): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${YACI_ADMIN}/local-cluster/api/addresses/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, adaAmount }),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (attempt < retries) {
      console.log(`Topup attempt ${attempt}/${retries} failed (${res.status}), retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    } else {
      throw new Error(`Topup failed after ${retries} attempts (${res.status}): ${text}`);
    }
  }
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

  const testAddr =
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";

  console.log(`Using test address: ${testAddr}`);
  console.log("\n--- Phase 1: Topup (ADA transfers) ---\n");

  const result1 = await topup(testAddr, 1000);
  console.log("TX 1 (1000 ADA):", JSON.stringify(result1));

  await new Promise((r) => setTimeout(r, 2000));

  console.log("\n--- Phase 2: Delegate to YACI genesis pool ---\n");

  try {
    const {
      initLucid,
      delegateToPool,
      getTestAddress,
      YACI_GENESIS_POOL_BECH32,
    } = await import("./cardano-tx-helpers.ts");

    const lucid = await initLucid();
    const walletAddr = getTestAddress();
    console.log(`Wallet address: ${walletAddr}`);

    await new Promise((r) => setTimeout(r, 3000));

    const { txHash: delegTxHash } = await delegateToPool(lucid, YACI_GENESIS_POOL_BECH32);
    console.log(`Delegation TX confirmed: ${delegTxHash}`);
  } catch (e) {
    console.error("Phase 2 (delegation) failed:", e);
    console.error("Continuing — Phase 1 topup transactions are still valid.");
  }

  console.log("\nTransaction submission complete!");
}

main().catch((e) => {
  console.error("Transaction submission failed:", e);
  process.exit(1);
});
