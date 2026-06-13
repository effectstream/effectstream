/**
 * Midnight E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator/cli.ts (DB + Midnight node/indexer/proof-server + deploy + sync node)
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
} from "@e2e/engine";
import type { Client } from "pg";
import path from "path";
import type { MintedTokens } from "../shared/contracts/midnight/trigger-token-mints.ts";

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

async function doTriggerNullifiers(): Promise<void> {
  try {
    const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
    const { triggerNullifiers } = await import("../shared/contracts/midnight/faucet.ts");
    await triggerNullifiers(
      {
        indexer: midnightNetworkConfig.indexer,
        indexerWS: midnightNetworkConfig.indexerWS,
        node: midnightNetworkConfig.node,
        proofServer: midnightNetworkConfig.proofServer,
      },
      midnightNetworkConfig.id,
    );
  } catch (e) {
    console.error("Failed to trigger nullifiers (non-fatal):", e);
  }
}

// -- Unshielded-create trigger: unshielded self-transfer creates UTXOs --------

async function doTriggerUnshieldedCreates(): Promise<void> {
  try {
    const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
    const { triggerUnshieldedCreates } = await import("../shared/contracts/midnight/faucet.ts");
    await triggerUnshieldedCreates(
      {
        indexer: midnightNetworkConfig.indexer,
        indexerWS: midnightNetworkConfig.indexerWS,
        node: midnightNetworkConfig.node,
        proofServer: midnightNetworkConfig.proofServer,
      },
      midnightNetworkConfig.id,
    );
  } catch (e) {
    console.error("Failed to trigger unshielded creates (non-fatal):", e);
  }
}

// -- Token-mint trigger: mint custom tokens via the counter contract ----------

async function doTriggerTokenMints(): Promise<MintedTokens | undefined> {
  try {
    const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
    const { triggerTokenMints } = await import("../shared/contracts/midnight/trigger-token-mints.ts");
    return await triggerTokenMints(
      {
        indexer: midnightNetworkConfig.indexer,
        indexerWS: midnightNetworkConfig.indexerWS,
        node: midnightNetworkConfig.node,
        proofServer: midnightNetworkConfig.proofServer,
      },
      midnightNetworkConfig.id,
    );
  } catch (e) {
    console.error("Failed to trigger token mints (non-fatal):", e);
    return undefined;
  }
}

// -- Indexer GraphQL helper (fidelity cross-checks) ----------------------------

const INDEXER_GRAPHQL_URL = "http://localhost:8088/api/v3/graphql";

async function indexerGql(query: string, variables?: unknown): Promise<any> {
  const response = await fetch(INDEXER_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

/**
 * Scan indexer blocks from latest going back, looking for the transaction with
 * `txHash` and returning its zswapMerkleTreeRoot (RegularTransaction only).
 */
async function findIndexerRootForTx(txHash: string, maxBlocksBack = 600): Promise<string | undefined> {
  const latest = (await indexerGql(`{ block { height } }`))?.data?.block?.height;
  if (typeof latest !== "number") return undefined;
  const floor = Math.max(1, latest - maxBlocksBack);
  for (let h = latest; h >= floor; h--) {
    const res = await indexerGql(
      `query($h: Int!) {
        block(offset: { height: $h }) {
          transactions { hash ... on RegularTransaction { zswapMerkleTreeRoot } }
        }
      }`,
      { h },
    );
    for (const tx of res?.data?.block?.transactions ?? []) {
      if (tx.hash === txHash && tx.zswapMerkleTreeRoot) {
        return tx.zswapMerkleTreeRoot;
      }
    }
  }
  return undefined;
}

// -- Sync Tests (STM value validation) ----------------------------------------

async function runSyncTests(db: Client, minted?: MintedTokens): Promise<void> {
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

  // UnshieldedCreate primitive: tracked + populated by the unshielded transfer
  await assertSQL<{ primitive_name: string }>(
    "Midnight: primitive_accounting has Midnight-UnshieldedCreate entries",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Midnight-UnshieldedCreate'
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].primitive_name === "Midnight-UnshieldedCreate",
  );

  await assertSQL<{ owner: string; intent_hash: string; output_index: number; tx_hash: string | null }>(
    "Midnight: midnight_unshielded_creates has shape-valid rows from unshielded transfer",
    db,
    `SELECT owner, intent_hash, output_index, tx_hash FROM midnight_unshielded_creates
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      console.log(`  Unshielded-create count: ${res.rows.length}`);
      return res.rows.every((r) =>
        r.owner.length > 0 &&
        r.intent_hash.length > 0 &&
        r.output_index >= 0 &&
        (r.tx_hash ?? "").length > 0
      );
    },
  );

  // ZswapRoot primitive: tracked + roots are well-formed (33-byte SCALE run,
  // lowercase hex, first byte 0x73 — the form verified against the live chain)
  await assertSQL<{ primitive_name: string }>(
    "Midnight: primitive_accounting has Midnight-ZswapRoot entries",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Midnight-ZswapRoot'
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].primitive_name === "Midnight-ZswapRoot",
  );

  const rootsResult = await assertSQL<{ root: string; tx_hash: string | null; block_height: number }>(
    "Midnight: midnight_zswap_roots tracks well-formed advancing roots",
    db,
    `SELECT root, tx_hash, block_height FROM midnight_zswap_roots
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      console.log(`  Zswap root count: ${res.rows.length}`);
      const malformed = res.rows.filter((r) => !/^73[0-9a-f]{64}$/.test(r.root));
      if (malformed.length > 0) {
        console.error("  Malformed roots:", malformed.map((r) => r.root));
        return false;
      }
      return res.rows.every((r) => (r.tx_hash ?? "").length > 0);
    },
  );

  // Fidelity cross-check: the latest stored root must byte-equal what the
  // indexer reports as zswapMerkleTreeRoot for that same transaction —
  // proves fetcher→STM→DB did not mangle the value.
  await assert(
    "Midnight: stored zswap root matches indexer zswapMerkleTreeRoot for its tx",
    async () => {
      const last = rootsResult.rows[rootsResult.rows.length - 1];
      if (!last?.tx_hash) {
        console.error("  No stored root/tx_hash to cross-check");
        return false;
      }
      const indexerRoot = await findIndexerRootForTx(last.tx_hash);
      console.log(`  stored:  ${last.root}`);
      console.log(`  indexer: ${indexerRoot}`);
      return indexerRoot === last.root;
    },
  );

  // ── TokenMint primitive: token id → minting contract registry ──────────────
  // The primitive OWNS this table (no STM handler / migration). It's published
  // as primitives.midnight_token_mint_view_<instance>, where the instance name
  // "Midnight-TokenMint" is lowercased + stripped to a valid SQL name.
  const TOKEN_MINT_VIEW =
    "primitives.midnight_token_mint_view_" +
    "Midnight-TokenMint".toLowerCase().replace(/[^a-z0-9_]/g, "");

  // L1: the primitive ran at all.
  await assertSQL<{ primitive_name: string }>(
    "Midnight: primitive_accounting has Midnight-TokenMint entries",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Midnight-TokenMint'
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].primitive_name === "Midnight-TokenMint",
  );

  // L2: the registry has shape-valid rows for both mint kinds.
  const mintsResult = await assertSQL<{
    token_type: string;
    kind: string;
    contract_address: string;
    domain_sep: string;
    total_minted: string;
    tx_hash: string | null;
  }>(
    "Midnight: owned token-mint view has shape-valid shielded + unshielded rows",
    db,
    `SELECT token_type, kind, contract_address, domain_sep, total_minted, tx_hash
     FROM ${TOKEN_MINT_VIEW} ORDER BY token_type, kind;`,
    (res) => res.rows.length >= 2,
    (res) => {
      console.log(`  Token-mint count: ${res.rows.length}`);
      const kinds = new Set(res.rows.map((r) => r.kind));
      return (
        kinds.has("shielded") &&
        kinds.has("unshielded") &&
        res.rows.every((r) =>
          /^[0-9a-f]{64}$/.test(r.token_type) &&
          /^[0-9a-f]{64}$/.test(r.domain_sep) &&
          r.contract_address.length > 0 &&
          (r.tx_hash ?? "").length > 0 &&
          Number(r.total_minted) > 0
        )
      );
    },
  );

  // L3a: derivation fidelity — recompute rawTokenType(domain_sep, contract)
  // with ledger-v8 for every row and require byte-equality with the stored
  // token_type. Proves the fetcher's derivation (and the row pairing) exact.
  await assert(
    "Midnight: every stored token_type equals rawTokenType(domain_sep, contract_address)",
    async () => {
      const { rawTokenType } = await import("@midnight-ntwrk/ledger-v8");
      const hexToBytes = (hex: string) =>
        Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
      const normalize = (s: string) => s.replace(/^0x/, "").toLowerCase();
      for (const row of mintsResult.rows) {
        const derived = normalize(
          String(rawTokenType(hexToBytes(row.domain_sep), row.contract_address)),
        );
        if (derived !== normalize(row.token_type)) {
          console.error(
            `  MISMATCH kind=${row.kind}: derived=${derived} stored=${row.token_type}`,
          );
          return false;
        }
      }
      return mintsResult.rows.length > 0;
    },
  );

  // L3b: the user's use case — the wallet-visible colors returned by the mint
  // trigger must resolve through the registry to the minting contract.
  await assert(
    "Midnight: trigger's wallet-visible colors resolve to the counter contract via the registry",
    async () => {
      if (!minted) {
        console.error("  No minted-token info from the trigger");
        return false;
      }
      const normalize = (s: string) => s.replace(/^0x/, "").toLowerCase();
      const sameAddress = (a: string, b: string) => {
        const an = normalize(a), bn = normalize(b);
        const longest = Math.max(an.length, bn.length);
        // Addresses length can be padded by 0's
        return an.padStart(longest, "0") === bn.padStart(longest, "0");
      };
      for (
        const [kind, expected] of [
          ["shielded", minted.shielded],
          ["unshielded", minted.unshielded],
        ] as const
      ) {
        const row = mintsResult.rows.find(
          (r) => r.kind === kind && normalize(r.token_type) === normalize(expected.color),
        );
        if (!row) {
          console.error(`  No registry row for ${kind} color ${expected.color}`);
          return false;
        }
        if (normalize(row.domain_sep) !== normalize(expected.domainSep)) {
          console.error(`  ${kind} domain_sep mismatch: ${row.domain_sep} != ${expected.domainSep}`);
          return false;
        }
        if (!sameAddress(row.contract_address, minted.contractAddress)) {
          console.error(`  ${kind} contract mismatch: ${row.contract_address} != ${minted.contractAddress}`);
          return false;
        }
        if (row.total_minted !== minted.amount) {
          console.error(`  ${kind} total_minted ${row.total_minted} != minted ${minted.amount}`);
          return false;
        }
      }
      return true;
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

    // 4.5. Trigger a shielded transfer to produce nullifier events on-chain,
    // an unshielded self-transfer to produce unshielded-create events, then
    // contract mints to produce token-mint events. (To run the TokenMint
    // negative check, skip the mint trigger and confirm its assertions fail.)
    await doTriggerNullifiers();
    await doTriggerUnshieldedCreates();
    const minted = await doTriggerTokenMints();

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await runSyncTests(db, minted);

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
