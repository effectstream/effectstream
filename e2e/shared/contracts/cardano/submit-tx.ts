/**
 * Create transactions on the YACI DevKit devnet.
 *
 * Phase 1: Uses the YACI Admin API to topup addresses (ADA transfers).
 * Phase 2: Uses Lucid Evolution to mint tokens and transfer assets.
 *
 * These transactions exercise the Cardano primitives:
 *   - Topup → captured by Transfer primitive
 *   - Mint  → captured by MintBurn primitive
 *   - Burn  → captured by MintBurn primitive
 *   - Transfer with assets → captured by Transfer + DelayedAsset primitives
 */

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

  // Use a well-known test address (Shelley enterprise address for protocol magic 42)
  const testAddr =
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";

  console.log(`Using test address: ${testAddr}`);
  console.log("\n--- Phase 1: Topup transactions (ADA transfers) ---\n");

  const result1 = await topup(testAddr, 1000);
  console.log("TX 1 (1000 ADA):", JSON.stringify(result1));

  await new Promise((r) => setTimeout(r, 2000));

  const result2 = await topup(testAddr, 500);
  console.log("TX 2 (500 ADA):", JSON.stringify(result2));

  await new Promise((r) => setTimeout(r, 2000));

  const result3 = await topup(testAddr, 100);
  console.log("TX 3 (100 ADA):", JSON.stringify(result3));

  // Wait for txs to be included in blocks
  console.log("\nWaiting for blocks to include topup transactions...");
  await new Promise((r) => setTimeout(r, 5000));

  // ── Phase 2: Lucid transactions (mint, burn, transfer) ──
  console.log("\n--- Phase 2: Lucid transactions (mint, burn, transfer) ---\n");

  try {
    const {
      initLucid,
      mintTokens,
      burnTokens,
      transferWithAssets,
      delegateToPool,
      getTestAddress,
      getTestPolicyId,
      lockNftAtScript,
      unlockNftFromScript,
      claimNftFromScript,
      getHololockerScriptHash,
      YACI_GENESIS_POOL_BECH32,
    } = await import("./cardano-tx-helpers.ts");

    const lucid = await initLucid();
    const walletAddr = getTestAddress();

    // Mint 1000 tokens
    const { txHash: mintTxHash, policyId } = await mintTokens(lucid, "TestToken", 1000n);
    console.log(`Mint TX confirmed: ${mintTxHash} (policyId: ${policyId})`);

    // Wait for mint to be indexed
    await new Promise((r) => setTimeout(r, 3000));

    // Burn 500 tokens
    const { txHash: burnTxHash } = await burnTokens(lucid, policyId, "TestToken", 500n);
    console.log(`Burn TX confirmed: ${burnTxHash}`);

    // Wait for burn to be indexed
    await new Promise((r) => setTimeout(r, 3000));

    // Transfer ADA + remaining tokens to the well-known test address
    const unit = `${policyId}${Buffer.from("TestToken").toString("hex")}`;
    const { txHash: transferTxHash } = await transferWithAssets(
      lucid, testAddr, 5_000_000n, { [unit]: 100n }
    );
    console.log(`Transfer TX confirmed: ${transferTxHash}`);

    // Write policy ID and script hash to temp files so config.ts can read them
    const policyFile = `${import.meta.dirname}/temp/test-policy-id.txt`;
    await Bun.write(policyFile, policyId);
    console.log(`\nPolicy ID written to ${policyFile}`);

    const scriptHash = getHololockerScriptHash();
    const scriptHashFile = `${import.meta.dirname}/temp/hololocker-script-hash.txt`;
    await Bun.write(scriptHashFile, scriptHash);
    console.log(`Script hash written to ${scriptHashFile}`);

    // Wait for transfer to be indexed
    await new Promise((r) => setTimeout(r, 3000));

    // Delegate to the YACI genesis pool
    const { txHash: delegTxHash } = await delegateToPool(lucid, YACI_GENESIS_POOL_BECH32);
    console.log(`Delegation TX confirmed: ${delegTxHash}`);

    // ── Phase 3: Projected NFT (Hololocker) ──
    console.log("\n--- Phase 3: Projected NFT (Lock → Unlock → Claim) ---\n");

    try {
      // Mint an NFT to lock at the script
      const { txHash: nftMintHash, policyId: nftPolicyId } = await mintTokens(lucid, "LockedNFT", 1n);
      console.log(`NFT mint confirmed: ${nftMintHash} (policy=${nftPolicyId})`);

      await new Promise((r) => setTimeout(r, 3000));

      const nftUnit = `${nftPolicyId}${Buffer.from("LockedNFT").toString("hex")}`;

      // Lock the NFT at the hololocker script
      let lockResult: { txHash: string; scriptAddress: string; outputIndex: number };
      try {
        lockResult = await lockNftAtScript(lucid, nftUnit);
        console.log(`Lock TX confirmed: ${lockResult.txHash} (script=${lockResult.scriptAddress}, idx=${lockResult.outputIndex})`);
      } catch (lockErr) {
        console.error("Phase 3 FAILED at lockNftAtScript:", lockErr);
        throw lockErr;
      }

      await new Promise((r) => setTimeout(r, 3000));

      // Initiate unlock (creates Unlocking state with time lock)
      let unlockResult: { txHash: string; forHowLong: bigint; claimableAfterMs: number };
      try {
        unlockResult = await unlockNftFromScript(
          lucid, lockResult.scriptAddress, lockResult.txHash, lockResult.outputIndex,
        );
        console.log(`Unlock TX confirmed: ${unlockResult.txHash} (forHowLong=${unlockResult.forHowLong}, claimableAfter=${unlockResult.claimableAfterMs})`);
      } catch (unlockErr) {
        console.error("Phase 3 FAILED at unlockNftFromScript:", unlockErr);
        throw unlockErr;
      }

      // claimableAfterMs is wall-clock time when the claim becomes valid
      const waitMs = Math.max(0, unlockResult.claimableAfterMs - Date.now()) + 5_000;
      console.log(`Waiting ${Math.round(waitMs / 1000)}s for time lock to expire...`);
      await new Promise((r) => setTimeout(r, waitMs));

      // Claim the NFT back
      try {
        const { txHash: claimTxHash } = await claimNftFromScript(lucid, lockResult.scriptAddress, unlockResult.txHash, unlockResult.forHowLong);
        console.log(`Claim TX confirmed: ${claimTxHash}`);
      } catch (claimErr) {
        console.error("Phase 3 FAILED at claimNftFromScript:", claimErr);
        throw claimErr;
      }
    } catch (phase3Err) {
      console.error("Phase 3 (Projected NFT) failed — see above for which step.");
    }

  } catch (e) {
    console.error("Phase 2/3 (Lucid transactions) failed:", e);
    console.error("Continuing — Phase 1 topup transactions are still valid for basic tests.");
  }

  console.log("\nTransaction submission complete!");
}

main().catch((e) => {
  console.error("Transaction submission failed:", e);
  process.exit(1);
});
