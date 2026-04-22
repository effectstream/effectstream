/**
 * Midnight E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + Midnight node/indexer/proof-server + deploy + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify infrastructure)
 * 4. Runs sync tests (verify STM wrote correct values to DB)
 * 5. Shuts down everything
 */
import {
  anyError,
  assert,
  assertSQL,
  printSummary,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  waitForBlock,
  getDBConnection,
} from "@e2e-v2/engine";
import type { Client } from "pg";
import path from "path";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

// Midnight parallel sync has 18s delay — increase assertion timeout to allow catch-up
if (!process.env["E2E_MAX_TIMEOUT"]) {
  process.env["E2E_MAX_TIMEOUT"] = "60000";
}

// -- Infrastructure Tests (run before contract deployment) ---------------------

async function runInfraTests(): Promise<void> {
  console.log("\n--- Phase 1: Infrastructure Tests ---\n");

  await assert("Midnight node is responding on port 9944", async () => {
    try {
      const response = await fetch("http://localhost:9944", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "system_health",
          params: [],
        }),
      });
      const json = await response.json() as any;
      return json.result !== undefined;
    } catch {
      return false;
    }
  });

  await assert("Midnight indexer is responding on port 8088", async () => {
    try {
      const response = await fetch("http://localhost:8088/api/v3/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "{ __typename }",
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  });
}

// -- Contract Tests (run after deployment) ------------------------------------

async function runContractTests(): Promise<void> {
  console.log("\n--- Phase 2: Contract Tests ---\n");

  await assert("Midnight counter contract deployed", async () => {
    try {
      const { readMidnightContract } = await import("@effectstream/midnight-contracts/read-contract");
      const info = readMidnightContract("contract-counter", { networkId: "undeployed" });
      return info.contractAddress !== undefined && info.contractAddress.length > 0;
    } catch {
      return false;
    }
  });

  await assert("Midnight EIP-20 contract deployed", async () => {
    try {
      const { readMidnightContract } = await import("@effectstream/midnight-contracts/read-contract");
      const info = readMidnightContract("contract-eip-20", { networkId: "undeployed" });
      return info.contractAddress !== undefined && info.contractAddress.length > 0;
    } catch {
      return false;
    }
  });
}

// -- Nullifier trigger: perform a shielded transfer to spend nullifiers ------

async function triggerNullifiers(): Promise<void> {
  console.log("\n--- Triggering nullifiers via shielded transfer ---\n");
  try {
    const { setNetworkId } = await import("@midnight-ntwrk/midnight-js-network-id");
    const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
    const { buildWalletFacade, syncAndWaitForFunds } = await import("../shared/contracts/midnight/faucet.ts");
    const { shieldedToken } = await import("@midnight-ntwrk/ledger-v8");
    const Rx = await import("rxjs");

    setNetworkId(midnightNetworkConfig.id);
    const networkUrls = {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
    };

    // Build genesis wallet (has shielded balance from chain genesis)
    const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
    const walletResult = await buildWalletFacade(networkUrls, GENESIS_SEED, midnightNetworkConfig.id);
    console.log("Genesis wallet built, waiting for funds...");

    await syncAndWaitForFunds(walletResult.wallet, {
      waitNonZero: true,
      logLabel: "genesis-nullifier",
      timeoutMs: 120_000,
    });

    // Get the shielded address to send to self (spending shielded inputs = nullifiers)
    const shieldedAddr = await walletResult.wallet.shielded.getAddress();
    const tokenId = shieldedToken().raw;
    console.log(`Doing shielded self-transfer (token: ${tokenId}) to trigger nullifier spend...`);

    const recipe = await walletResult.wallet.transferTransaction(
      [{
        type: "shielded",
        outputs: [{
          amount: 1n,
          type: tokenId,
          receiverAddress: shieldedAddr,
        }],
      }],
      {
        shieldedSecretKeys: walletResult.walletZswapSecretKeys,
        dustSecretKey: walletResult.walletDustSecretKey,
      },
      { ttl: new Date(Date.now() + 60 * 60 * 1000) },
    );
    console.log("Shielded transfer recipe created");

    const signedTx = await walletResult.wallet.signUnprovenTransaction(
      recipe.transaction,
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
    );
    const finalizedTx = await walletResult.wallet.finalizeTransaction(signedTx);
    const txId = await walletResult.wallet.submitTransaction(finalizedTx);
    console.log(`Shielded transfer submitted, txId: ${txId} — nullifiers should be spent on-chain`);

    // ── Also test initSwap nullifiers ──────────────────────────────────────
    console.log("\nTesting initSwap + balanceUnprovenTransaction nullifiers...");

    // Re-sync wallet after the transfer
    await syncAndWaitForFunds(walletResult.wallet, {
      waitNonZero: true,
      logLabel: "genesis-post-transfer",
      timeoutMs: 120_000,
    });

    const tokenId2 = shieldedToken().raw;
    const shieldedAddr2 = await walletResult.wallet.shielded.getAddress();

    // Create a swap offer: give 1 shielded token, want 1 back (self-swap)
    console.log("Creating swap offer via initSwap...");
    const offerRecipe = await walletResult.wallet.initSwap(
      { shielded: { [tokenId2]: 1n } },
      [{
        type: "shielded",
        outputs: [{
          type: tokenId2,
          amount: 1n,
          receiverAddress: shieldedAddr2,
        }],
      }],
      {
        shieldedSecretKeys: walletResult.walletZswapSecretKeys,
        dustSecretKey: walletResult.walletDustSecretKey,
      },
      { ttl: new Date(Date.now() + 60 * 60 * 1000) },
    );
    console.log("Swap offer created via initSwap");

    // Complete the swap ourselves (balance + sign + submit)
    const balancedRecipe = await walletResult.wallet.balanceUnprovenTransaction(
      offerRecipe.transaction,
      {
        shieldedSecretKeys: walletResult.walletZswapSecretKeys,
        dustSecretKey: walletResult.walletDustSecretKey,
      },
      { ttl: new Date(Date.now() + 60 * 60 * 1000) },
    );
    console.log("Swap balanced");

    const signedSwapTx = await walletResult.wallet.signUnprovenTransaction(
      balancedRecipe.transaction,
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
    );
    const finalizedSwapTx = await walletResult.wallet.finalizeTransaction(signedSwapTx);
    const swapTxId = await walletResult.wallet.submitTransaction(finalizedSwapTx);
    console.log(`Swap submitted, txId: ${swapTxId} — swap nullifiers should be spent on-chain`);

    await walletResult.wallet.stop();
  } catch (e) {
    console.error("Failed to trigger nullifiers (non-fatal):", e);
  }
}

// -- Sync Tests (STM value validation) ----------------------------------------

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 3: Sync Tests (STM value validation) ---\n");

  await assertSQL<{ id: number; primitive_name: string; payload_json: string }>(
    "Midnight: midnight_state has counter contract entries",
    db,
    `SELECT id, primitive_name, payload_json FROM midnight_state
     WHERE primitive_name = 'midnightContractState'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const first = res.rows[0];
      try {
        const payload = JSON.parse(first.payload_json);
        return payload !== null && typeof payload === "object";
      } catch {
        return first.payload_json.length > 0;
      }
    },
  );

  await assertSQL<{ primitive_name: string; payload: any }>(
    "Midnight: primitive_accounting has MidnightContractState entries",
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting
     WHERE primitive_name = 'MidnightContractState'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const first = res.rows[0];
      return first.primitive_name === "MidnightContractState";
    },
  );

  // Nullifier primitive: verify that the Midnight-Nullifier primitive is tracked
  await assertSQL<{ primitive_name: string }>(
    "Midnight: primitive_accounting has Midnight-Nullifier entries",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Midnight-Nullifier'
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.primitive_name === "Midnight-Nullifier",
  );

  // Nullifier STM: verify that nullifier events were written to the user table
  // The shielded transfer and initSwap+complete both spend shielded inputs producing nullifiers
  await assertSQL<{ id: number; nullifier: string }>(
    "Midnight: midnight_nullifiers has entries from shielded transfer",
    db,
    `SELECT id, nullifier FROM midnight_nullifiers ORDER BY id ASC LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const first = res.rows[0];
      return typeof first.nullifier === "string" && first.nullifier.length > 0;
    },
  );

  // Note: initSwap + balanceUnprovenTransaction does NOT produce ZswapInput ledger events.
  // Atomic swap nullifiers are verified inside the ZK proof but not emitted as separate events.
  // Only transferTransaction produces ZswapInput events with nullifier spends.
  await assertSQL<{ count: string }>(
    "Midnight: midnight_nullifiers has multiple entries from shielded transfer",
    db,
    `SELECT COUNT(*)::text as count FROM midnight_nullifiers;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const count = parseInt(res.rows[0]?.count ?? "0", 10);
      console.log(`  Nullifier count: ${count}`);
      return count >= 2;
    },
  );
}

// -- Main ---------------------------------------------------------------------

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    // 2. Wait for node + indexer to be up, then run infra tests
    await waitForProcess("midnight-node-wait", { waitForExit: true });
    await waitForProcess("midnight-indexer-wait", { waitForExit: true });
    await runInfraTests();

    // 3. Wait for contract deployment, then run contract tests
    await waitForProcess("midnight-contract", { waitForExit: true, timeoutMs: 300_000 });
    console.log("Midnight contracts deployed.\n");
    await runContractTests();

    // 4. Wait for sync node to be healthy
    await waitForProcess("sync");
    await waitForHealth();
    await waitForBlock(1);
    console.log("Sync node is healthy.\n");

    // 4.5. Trigger a shielded transfer to produce nullifier events on-chain
    await triggerNullifiers();

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await runSyncTests(db);

    // 6. Wait for batcher + run batcher tests
    try {
      await waitForProcess("batcher-wait", { waitForExit: true, timeoutMs: 120_000 });
      console.log("\n--- Phase 4: Batcher Tests ---\n");
      const { batcherTest } = await import("./sync/batcher.test.ts");
      await batcherTest();
    } catch (e) {
      console.error("Batcher phase failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    // 7. Summary
    printSummary();
  } catch (e) {
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfrastructure();
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

test();
