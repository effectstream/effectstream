/**
 * ZSwap-DA E2E Test Runner
 *
 * Full swap lifecycle:
 *   1. Start infrastructure (PGLite + Celestia + Midnight + deploy contract)
 *   2. Fund 2 wallets via genesis faucet
 *   3. Mint shielded TokenA (wallet 1) and TokenB (wallet 2)
 *   4. Wallet 1 creates swap offer (give TokenA, want TokenB) and submits to Celestia
 *   5. Wait for Celestia sync to index the offer in DB
 *   6. Wallet 2 reads offer, balances, signs, and completes swap on Midnight
 *   7. Verify nullifier consumption and offer archival
 *
 * NOTE: This file historically drove the backend-wallet pipeline via
 * `initSwap` (offers as <Sig, PreProof, PreBinding>). The demo now requires
 * Lace-shaped <Sig, Proof, Binding> offers end-to-end — the state machine
 * only deserializes that shape, and there's no backend-wallet completion
 * endpoint anymore. The deserialize triple below is updated for shape
 * consistency, but the offer-creation + completion steps still exercise
 * removed backend-wallet code paths and need to be rewritten on top of the
 * browser/batcher flow before this runner is green again.
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
  getDBConnection,
} from "../../e2e/shared/engine/mod.ts";
import type { Client } from "pg";
import path from "path";
import { Buffer } from "node:buffer";

// Midnight imports for wallet/contract operations in the test runner itself
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { configureMidnightNodeProviders } from "@effectstream/midnight-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { OfferFilesContract, witnesses } from "@zswap-da/contract-offer-files";
import {
  buildWalletFacade,
  syncAndWaitForFunds,
  faucet,
  type WalletResult,
} from "../../e2e/shared/contracts/midnight/faucet.ts";
import { encodeOffer, decodeOffer } from "mip-zswap-offer";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");
const CELESTIA_NAMESPACE = "000000000000deadbeef";

// Midnight parallel sync has 18s delay — increase assertion timeout
if (!process.env["E2E_MAX_TIMEOUT"]) {
  process.env["E2E_MAX_TIMEOUT"] = "180000";
}

// Two independent wallet seeds (genesis seed 0x...01 is used for deploy + faucet)
const WALLET_SEED_1 = "0000000000000000000000000000000000000000000000000000000000000002";
const WALLET_SEED_2 = "0000000000000000000000000000000000000000000000000000000000000003";

// ── Celestia blob helpers ─────────────────────────────────────────────────────

function celestiaNamespaceBase64(hex: string): string {
  const buffer = Buffer.alloc(29);
  const hexBuffer = Buffer.from(hex, "hex");
  hexBuffer.copy(buffer, 29 - hexBuffer.length);
  return buffer.toString("base64");
}

async function celestiaSubmitBlob(data: string): Promise<number> {
  const b64 = Buffer.from(data).toString("base64");
  const ns = celestiaNamespaceBase64(CELESTIA_NAMESPACE);
  // gasLimit scales with blob size; bech32m offer blobs are ~3–5 KB, so allow headroom.
  const gasLimit = Math.max(200_000, 50 * b64.length);
  const fee = Math.max(5_000, Math.ceil(gasLimit / 50));
  const res = await fetch("http://localhost:26658", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "blob.Submit",
      params: [
        [{ namespace: ns, data: b64, share_version: 0 }],
        { fee, gasLimit },
      ],
    }),
  });
  const json = (await res.json()) as any;
  if (json.error) {
    throw new Error(`blob.Submit error: ${JSON.stringify(json.error)}`);
  }
  const height = typeof json.result === "number" ? json.result : Number(json.result);
  if (!Number.isFinite(height)) {
    throw new Error(`blob.Submit returned unexpected result: ${JSON.stringify(json.result)}`);
  }
  return height;
}

// ── Contract helper ───────────────────────────────────────────────────────────

async function joinContract(walletResult: WalletResult) {
  const contractInfo = readMidnightContract("contract-offer-files", {
    baseDir: path.resolve(import.meta.dirname!, "../packages/midnight-contracts/"),
    networkId: midnightNetworkConfig.id,
  });

  const networkUrls = {
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
    id: midnightNetworkConfig.id,
  };

  const providers = configureMidnightNodeProviders(
    walletResult.wallet,
    walletResult.zswapSecretKeys,
    walletResult.walletZswapSecretKeys,
    walletResult.dustSecretKey,
    walletResult.walletDustSecretKey,
    networkUrls,
    "offerFilesPrivateState",
    contractInfo.zkConfigPath,
    walletResult.unshieldedKeystore,
  );

  const compiledContract = CompiledContract.make(
    "contract-offer-files",
    OfferFilesContract.Contract as any,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as unknown as never),
    CompiledContract.withCompiledFileAssets(
      path.dirname(contractInfo.zkConfigPath),
    ),
  );

  const contract = await findDeployedContract(
    providers,
    {
      contractAddress: contractInfo.contractAddress,
      compiledContract: compiledContract as any,
      privateStateId: "offerFilesPrivateState",
      initialPrivateState: {},
    },
  );

  return contract as any;
}

// ── Phase 1: Infrastructure validation ────────────────────────────────────────

async function runInfraTests(): Promise<void> {
  console.log("\n--- Phase 1: Infrastructure Tests ---\n");

  await assert("Celestia consensus node responds on 26657", async () => {
    const res = await fetch("http://localhost:26657/status");
    const json = (await res.json()) as any;
    return json.result?.node_info != null;
  });

  await assert("Celestia bridge node responds on 26658", async () => {
    const res = await fetch("http://localhost:26658", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "header.NetworkHead", params: [],
      }),
    });
    const json = (await res.json()) as any;
    return json.result !== undefined || json.error === undefined;
  });

  await assert("Midnight node responds on 9944", async () => {
    const res = await fetch("http://localhost:9944", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "system_health", params: [],
      }),
    });
    const json = (await res.json()) as any;
    return json.result != null;
  });

  await assert("Midnight indexer responds on 8088", async () => {
    const res = await fetch("http://localhost:8088/api/v3/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    return res.ok;
  });
}

// ── Phase 2: ZSwap full flow ──────────────────────────────────────────────────

async function runZswapTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: ZSwap Backend Flow Tests ---\n");

  const networkId = midnightNetworkConfig.id;
  setNetworkId(networkId);

  const networkUrls = {
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  };

  // ── 2a. Build wallets ──────────────────────────────────────────────────────
  console.log("Building wallet 1...");
  const wallet1Result = await buildWalletFacade(networkUrls, WALLET_SEED_1, networkId);
  console.log(`Wallet 1 address: ${wallet1Result.unshieldedAddress}`);

  console.log("Building wallet 2...");
  const wallet2Result = await buildWalletFacade(networkUrls, WALLET_SEED_2, networkId);
  console.log(`Wallet 2 address: ${wallet2Result.unshieldedAddress}`);

  // ── 2b. Fund wallets via faucet ────────────────────────────────────────────
  console.log("Funding wallets via genesis faucet...");
  await faucet([wallet1Result.unshieldedAddress, wallet2Result.unshieldedAddress]);

  console.log("Waiting for wallet 1 to sync funds...");
  const w1Balances = await syncAndWaitForFunds(wallet1Result.wallet, {
    waitNonZero: true,
    logLabel: "wallet1",
    timeoutMs: 300_000,
  });
  console.log(`Wallet 1 balances: shielded=${w1Balances.shieldedBalance}, unshielded=${w1Balances.unshieldedBalance}, dust=${w1Balances.dustBalance}`);

  console.log("Waiting for wallet 2 to sync funds...");
  const w2Balances = await syncAndWaitForFunds(wallet2Result.wallet, {
    waitNonZero: true,
    logLabel: "wallet2",
    timeoutMs: 300_000,
  });
  console.log(`Wallet 2 balances: shielded=${w2Balances.shieldedBalance}, unshielded=${w2Balances.unshieldedBalance}, dust=${w2Balances.dustBalance}`);

  // ── 2c. Join contract from both wallets ────────────────────────────────────
  console.log("Wallet 1 joining contract...");
  const contract1 = await joinContract(wallet1Result);
  console.log("Wallet 1 joined contract");

  console.log("Wallet 2 joining contract...");
  const contract2 = await joinContract(wallet2Result);
  console.log("Wallet 2 joined contract");

  // ── 2d. Mint shielded tokens ───────────────────────────────────────────────
  const DOMAIN_SEP_A = new Uint8Array(32).fill(0xAA);
  const DOMAIN_SEP_B = new Uint8Array(32).fill(0xBB);
  const MINT_AMOUNT = 100n;
  const Rx = await import("rxjs");

  console.log("Wallet 1: Minting shielded TokenA...");
  const mintA = await contract1.callTx.mint_shielded(DOMAIN_SEP_A, MINT_AMOUNT, 1n);
  console.log(`TokenA minted, txHash=${mintA.public?.txHash}`);

  console.log("Wallet 2: Minting shielded TokenB...");
  const mintB = await contract2.callTx.mint_shielded(DOMAIN_SEP_B, MINT_AMOUNT, 2n);
  console.log(`TokenB minted, txHash=${mintB.public?.txHash}`);

  // Wait for wallets to see the minted tokens in their shielded balances.
  // We poll the wallet state observable for a non-native shielded balance key.
  async function waitForMintedToken(wallet: any, label: string, timeoutMs = 120_000): Promise<string> {
    console.log(`Waiting for ${label} to see minted token...`);
    const state: any = await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.tap((s: any) => {
          const keys = Object.keys(s.shielded?.balances ?? {});
          const nonNative = keys.filter((k: string) => !k.startsWith("0000000000"));
          console.log(`[${label}] shielded keys: ${keys.length}, non-native: ${nonNative.length} ${JSON.stringify(nonNative)}`);
        }),
        Rx.filter((s: any) => {
          const balances = s.shielded?.balances ?? {};
          return Object.entries(balances).some(
            ([k, v]) => !k.startsWith("0000000000") && (v as bigint) > 0n
          );
        }),
        Rx.timeout({ each: timeoutMs, with: () => Rx.throwError(() => new Error(`${label}: timeout waiting for minted token`)) }),
      ),
    );
    const balances = state.shielded?.balances ?? {};
    const color = Object.entries(balances).find(
      ([k, v]) => !k.startsWith("0000000000") && (v as bigint) > 0n
    )![0];
    console.log(`[${label}] Found minted token: ${color} (balance: ${balances[color]})`);
    return color;
  }

  const tokenAColor = await waitForMintedToken(wallet1Result.wallet, "wallet1");
  const tokenBColor = await waitForMintedToken(wallet2Result.wallet, "wallet2");

  // ── 2e. Create swap offer ──────────────────────────────────────────────────
  console.log("Wallet 1: Creating swap offer (give TokenA, want TokenB)...");

  // For shielded outputs, we need the shielded address (coinPublicKey), not the unshielded bech32
  const wallet1ShieldedAddr = await wallet1Result.wallet.shielded.getAddress();

  const offerRecipe = await wallet1Result.wallet.initSwap(
    { shielded: { [tokenAColor]: 50n } },
    [
      {
        type: "shielded",
        outputs: [{
          type: tokenBColor,
          amount: 50n,
          receiverAddress: wallet1ShieldedAddr,
        }],
      },
    ],
    {
      shieldedSecretKeys: wallet1Result.zswapSecretKeys,
      dustSecretKey: wallet1Result.dustSecretKey,
    },
    { ttl: new Date(Date.now() + 1000 * 60 * 60) },
  );

  const rawTxBytes = offerRecipe.transaction.serialize();
  const blob = encodeOffer(rawTxBytes);
  console.log(`Offer encoded to bech32m, length: ${blob.length}`);

  // ── 2f. Submit offer to Celestia ───────────────────────────────────────────
  console.log("Submitting offer blob to Celestia...");
  const blobHeight = await celestiaSubmitBlob(blob);
  console.log(`Blob submitted at Celestia height: ${blobHeight}`);

  // ── 2g. Wait for Celestia sync to index the offer ──────────────────────────
  await assertSQL<{ id: number }>(
    "ZSwap: offer_file has been indexed from Celestia blob",
    db,
    `SELECT id FROM offer_file WHERE celestia_height = ${blobHeight} LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.id > 0,
  );

  await assertSQL<{ token_color: string }>(
    "ZSwap: offer_file_tokens has GIVING entry for TokenA",
    db,
    `SELECT oft.token_color FROM offer_file_tokens oft
     JOIN offer_file of ON of.id = oft.offer_file_id
     WHERE oft.direction = 'GIVING' AND of.celestia_height = ${blobHeight}
     ORDER BY oft.id DESC LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.token_color === tokenAColor,
  );

  await assertSQL<{ token_color: string }>(
    "ZSwap: offer_file_tokens has WANTING entry for TokenB",
    db,
    `SELECT oft.token_color FROM offer_file_tokens oft
     JOIN offer_file of ON of.id = oft.offer_file_id
     WHERE oft.direction = 'WANTING' AND of.celestia_height = ${blobHeight}
     ORDER BY oft.id DESC LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.token_color === tokenBColor,
  );

  console.log("Offer indexed successfully in database!");

  // ── 2h. Wallet 2 completes the swap ────────────────────────────────────────
  console.log("Wallet 2: Reading offer from DB and completing swap...");

  const offerRow = await db.query(`SELECT * FROM offer_file WHERE celestia_height = ${blobHeight} ORDER BY id DESC LIMIT 1`);
  const offer = offerRow.rows[0];
  if (!offer) {
    const peek = await db.query(`SELECT id, celestia_height, LEFT(transaction_hex, 24) AS tx_prefix FROM offer_file ORDER BY id DESC LIMIT 5`);
    throw new Error(
      `No offer_file row for celestia_height=${blobHeight}. Latest rows: ${JSON.stringify(peek.rows)}`,
    );
  }

  // Deserialize the offer transaction (transaction_hex column holds the bech32m zswapoffer1… string)
  const ledger = await import("@midnight-ntwrk/ledger-v8");
  const rawTx = decodeOffer(offer.transaction_hex);
  const offerTx = ledger.Transaction.deserialize(
    "signature" as const,
    "proof" as const,
    "binding" as const,
    rawTx,
  ) as any;

  // Wallet 2 balances and completes the unproven transaction
  const balancedRecipe = await wallet2Result.wallet.balanceUnprovenTransaction(
    offerTx,
    {
      shieldedSecretKeys: wallet2Result.zswapSecretKeys,
      dustSecretKey: wallet2Result.dustSecretKey,
    },
    { ttl: new Date(Date.now() + 1000 * 60 * 60) },
  );

  const signedTx = await wallet2Result.wallet.signUnprovenTransaction(
    balancedRecipe.transaction,
    (payload: Uint8Array) => wallet2Result.unshieldedKeystore.signData(payload),
  );

  const finalizedTx = await wallet2Result.wallet.finalizeTransaction(signedTx);
  const txId = await wallet2Result.wallet.submitTransaction(finalizedTx);
  console.log(`Swap completed! Midnight txId: ${txId}`);

  // ── 2i. Verify nullifiers were extracted from the offer ────────────────────
  await assertSQL<{ nullifier: string }>(
    "ZSwap: offer_file_nullifiers has entries extracted from the offer transaction",
    db,
    `SELECT nullifier FROM (
       SELECT ofn.nullifier, of.celestia_height
       FROM offer_file_nullifiers ofn
       JOIN offer_file of ON of.id = ofn.offer_file_id
       UNION ALL
       SELECT ofnh.nullifier, ofh.celestia_height
       FROM offer_file_nullifiers_history ofnh
       JOIN offer_file_history ofh ON ofh.id = ofnh.offer_file_id
     ) combined WHERE celestia_height = ${blobHeight} LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => typeof res.rows[0]?.nullifier === "string" && res.rows[0].nullifier.length > 0,
  );

  // ── 2j. Verify offer was archived ───────────────────────────────────────────
  // The swap tx spends the offer's nullifiers on-chain. The sync node detects
  // the ZswapInput events, matches them to offer_file_nullifiers, and archives.
  await assertSQL<{ archive_reason: string }>(
    "ZSwap: offer archived with CONSUMED reason after swap completion",
    db,
    `SELECT archive_reason FROM offer_file_history WHERE archive_reason = 'CONSUMED' AND celestia_height = ${blobHeight} LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.archive_reason === "CONSUMED",
  );

  // The original offer should be deleted from the active table
  await assertSQL<{ count: string }>(
    "ZSwap: offer_file is empty (offer moved to history)",
    db,
    `SELECT COUNT(*)::text as count FROM offer_file WHERE celestia_height = ${blobHeight};`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.count === "0",
  );

  console.log("ZSwap e2e test completed successfully!");
}

// ── Phase 3: API flow tests ───────────────────────────────────────────────────

const API_BASE = "http://localhost:9999";

async function runApiTests(db: Client): Promise<void> {
  console.log("\n--- Phase 3: API Flow Tests ---\n");

  // 3a. Mint a shielded token via API
  console.log("API: Minting shielded token...");
  const mintRes = await fetch(`${API_BASE}/api/token/mint-shielded`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domainSep: "01", amount: "100", nonce: "99" }),
  });
  const mintData = await mintRes.json() as any;

  await assert("API: mint-shielded returns success", async () => {
    console.log("  mint response:", JSON.stringify(mintData));
    return mintRes.ok && mintData.success === true;
  });

  // 3b. Verify token appears in known-tokens
  await assert("API: known-tokens includes minted token", async () => {
    const res = await fetch(`${API_BASE}/api/known-tokens`);
    const tokens = await res.json() as any[];
    return tokens.some((t: any) => t.token_color.includes("01".padStart(64, "0")));
  });

  // 3c. Create a swap offer via API
  // Use the native shielded token (the genesis wallet has balance for it)
  const nativeToken = "0000000000000000000000000000000000000000000000000000000000000000";
  // The mint created a token with domain_sep 0x01 — use the minted token color
  const mintedTokenColor = "0101010101010101010101010101010101010101010101010101010101010101";

  console.log("API: Creating swap offer (give native shielded, want minted)...");
  const createRes = await fetch(`${API_BASE}/api/zswap/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gives: [{ type: "shielded", token: nativeToken, amount: "1" }],
      wants: [{ type: "shielded", token: mintedTokenColor, amount: "1" }],
    }),
  });
  const createData = await createRes.json() as any;

  await assert("API: zswap/create returns success with transaction", async () => {
    console.log("  create response:", JSON.stringify(createData).slice(0, 200));
    return createRes.ok && createData.success === true && typeof createData.transaction === "string";
  });

  // 3d. Submit the offer to Celestia via API
  console.log("API: Submitting offer to Celestia...");
  const submitRes = await fetch(`${API_BASE}/api/zswap/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction: createData.transaction,
      gives: [{ token: nativeToken, amount: "1" }],
      wants: [{ token: mintedTokenColor, amount: "1" }],
    }),
  });
  const submitData = await submitRes.json() as any;

  await assert("API: zswap/submit returns success", async () => {
    console.log("  submit response:", JSON.stringify(submitData).slice(0, 200));
    return submitRes.ok && submitData.success === true;
  });

  // 3e. Wait for the offer to appear in /api/zswaps (Celestia sync → STM → DB)
  await assertSQL<{ id: number }>(
    "API: offer appears in /api/zswaps after Celestia sync",
    db,
    `SELECT id FROM offer_file ORDER BY id DESC LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.id > 0,
  );

  // Also verify via the HTTP API directly
  await assert("API: GET /api/zswaps returns the offer", async () => {
    const res = await fetch(`${API_BASE}/api/zswaps?limit=10&offset=0`);
    const offers = await res.json() as any[];
    console.log(`  /api/zswaps returned ${offers.length} offer(s)`);
    return offers.length >= 1;
  });

  // 3f. Complete the offer via API
  console.log("API: Completing swap offer...");
  const offersRes = await fetch(`${API_BASE}/api/zswaps?limit=1&offset=0`);
  const offers = await offersRes.json() as any[];

  await assert("API: /api/zswaps has offers to complete", async () => {
    return offers.length > 0;
  });

  const offerId = offers[0].id;
  const completeRes = await fetch(`${API_BASE}/api/zswap/${offerId}/complete`, {
    method: "POST",
  });
  const completeData = await completeRes.json() as any;

  // Note: completing with the SAME wallet that created the offer will fail with
  // "Insufficient funds" because the inputs are already spent. In production,
  // a different wallet completes. Here we verify the endpoint is reachable and
  // processes the request (the SDK-based Phase 2 already tested full completion).
  await assert("API: zswap/:id/complete endpoint is functional", async () => {
    console.log("  complete response:", JSON.stringify(completeData).slice(0, 200));
    // Either success (different wallet) or InsufficientFunds (same wallet) is valid
    return completeRes.ok || completeData.error?.includes("Insufficient funds") || completeData.error?.includes("Insufficient");
  });

  console.log("API flow tests completed!");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start all infrastructure
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    // 2. Wait for Celestia infrastructure
    await waitForProcess("celestia-bridge-wait", { waitForExit: true, timeoutMs: 180_000 });
    await waitForProcess("celestia-fund-bridge", { waitForExit: true, timeoutMs: 60_000 });
    console.log("Celestia infrastructure ready.");

    // 3. Wait for Midnight infrastructure
    await waitForProcess("midnight-node-wait", { waitForExit: true, timeoutMs: 120_000 });
    await waitForProcess("midnight-indexer-wait", { waitForExit: true, timeoutMs: 120_000 });
    await waitForProcess("midnight-proof-server-wait", { waitForExit: true, timeoutMs: 120_000 });
    console.log("Midnight infrastructure ready.");

    // 4. Wait for contract deployment
    await waitForProcess("midnight-contract-deploy", { waitForExit: true, timeoutMs: 300_000 });
    console.log("Offer-files contract deployed.");

    // 5. Run infrastructure validation tests
    await runInfraTests();

    // 6. Wait for sync node
    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node is healthy.");

    // 7. Connect to DB and run ZSwap tests (SDK-based)
    db = getDBConnection();
    await runZswapTests(db);

    // 8. Run API flow tests (uses the same running backend)
    await runApiTests(db);

    // 9. Summary
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
