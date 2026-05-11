import * as fs from "node:fs";
import * as path from "node:path";

const YACI_ADMIN = "http://localhost:10000";
const TEMP_DIR = path.resolve(import.meta.dirname!, "temp");

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

async function waitForDolos(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch("http://localhost:3000/blocks/latest");
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Dolos MiniBF API not ready");
}

async function main() {
  console.log("Waiting for YACI Admin API...");
  await waitForYaci();
  console.log("Waiting for Dolos MiniBF API...");
  await waitForDolos();

  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const {
    initLucid,
    mintTokens,
    getTestAddress,
    getTestPolicyId,
    getHololockerScriptHash,
    lockNftAtScript,
    unlockNftFromScript,
    claimNftFromScript,
  } = await import("./cardano-tx-helpers.ts");

  console.log("\n--- Phase 1: Initialize wallet & topup ---\n");
  const lucid = await initLucid();
  const walletAddr = getTestAddress();
  console.log(`Wallet address: ${walletAddr}`);

  console.log("\n--- Phase 2: Mint test NFT ---\n");
  await new Promise((r) => setTimeout(r, 3000));
  const { policyId } = await mintTokens(lucid, "TestNFT", 1n);
  console.log(`Minted NFT with policy: ${policyId}`);

  fs.writeFileSync(path.join(TEMP_DIR, "test-policy-id.txt"), policyId, "utf-8");
  console.log(`Wrote policy ID to ${TEMP_DIR}/test-policy-id.txt`);

  const scriptHash = getHololockerScriptHash();
  fs.writeFileSync(path.join(TEMP_DIR, "hololocker-script-hash.txt"), scriptHash, "utf-8");
  console.log(`Wrote script hash to ${TEMP_DIR}/hololocker-script-hash.txt: ${scriptHash}`);

  if (!process.env.RUN_LIFECYCLE_TEST) return;

  console.log("\n--- Phase 3: Lock NFT at Hololocker ---\n");
  await new Promise((r) => setTimeout(r, 2000));

  const toHex = (text: string) => Buffer.from(text, "utf-8").toString("hex");
  const nftUnit = `${policyId}${toHex("TestNFT")}`;
  const { txHash: lockTxHash, scriptAddress, outputIndex } = await lockNftAtScript(lucid, nftUnit);
  console.log(`NFT locked: ${lockTxHash}#${outputIndex} at ${scriptAddress}`);

  console.log("\n--- Phase 4: Request unlock ---\n");
  await new Promise((r) => setTimeout(r, 3000));
  const { txHash: unlockTxHash, forHowLong, claimableAfterMs } = await unlockNftFromScript(
    lucid, scriptAddress, lockTxHash, outputIndex,
  );
  console.log(`Unlock requested: ${unlockTxHash} (claimable after ${claimableAfterMs}ms)`);

  console.log("\n--- Phase 5: Wait and claim ---\n");
  const waitMs = Math.max(0, claimableAfterMs - Date.now()) + 2000;
  console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for time-lock to expire...`);
  await new Promise((r) => setTimeout(r, waitMs));

  const { txHash: claimTxHash } = await claimNftFromScript(
    lucid, scriptAddress, unlockTxHash, forHowLong,
  );
  console.log(`NFT claimed back: ${claimTxHash}`);

  console.log("\nFull Lock → Unlock → Claim lifecycle complete!");
}

main().catch((e) => {
  console.error("Transaction submission failed:", e);
  process.exit(1);
});
