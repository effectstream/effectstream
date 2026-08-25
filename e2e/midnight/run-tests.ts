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
  recordCrash,
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
  const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");

  await assert(`Midnight node is responding at ${midnightNetworkConfig.node}`, async () => {
    try {
      const response = await fetch(midnightNetworkConfig.node, {
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

  await assert(`Midnight indexer is responding at ${midnightNetworkConfig.indexer}`, async () => {
    try {
      const response = await fetch(midnightNetworkConfig.indexer, {
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
}

// -- Unshielded-create trigger: unshielded self-transfer creates UTXOs --------

async function doTriggerUnshieldedCreates(): Promise<void> {
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
}

// -- Unshielded-swap trigger: initSwap deltas completed by a balancing intent --
// Runs FIRST among triggers: fees are paid in dust, and genesis dust is
// depleted by the other triggers faster than it regenerates — a swap submitted
// with dustBalance=0 is rejected by the node (Invalid Transaction: error 168).

type UnshieldedSwapResult =
  import("../shared/contracts/midnight/faucet.ts").UnshieldedSwapResult;

async function doTriggerUnshieldedSwap(): Promise<UnshieldedSwapResult> {
  const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
  const { triggerUnshieldedSwap } = await import("../shared/contracts/midnight/faucet.ts");
  return triggerUnshieldedSwap(
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
    },
    midnightNetworkConfig.id,
  );
}

// -- Token-mint trigger: mint custom tokens via the counter contract ----------

async function doTriggerTokenMints(): Promise<MintedTokens> {
  const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
  const { triggerTokenMints } = await import("../shared/contracts/midnight/trigger-token-mints.ts");
  return triggerTokenMints(
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
    },
    midnightNetworkConfig.id,
  );
}

// -- Indexer GraphQL helper (fidelity cross-checks) ----------------------------

async function indexerGql(query: string, variables?: unknown): Promise<any> {
  const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
  const response = await fetch(midnightNetworkConfig.indexer, {
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

async function runSyncTests(
  db: Client,
  minted?: MintedTokens,
  uswap?: UnshieldedSwapResult,
): Promise<void> {
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

  // NullifierAndCommitment primitive: verify that it is tracked
  await assertSQL<{ primitive_name: string }>(
    "Midnight: primitive_accounting has Midnight-NullifierAndCommitment entries",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Midnight-NullifierAndCommitment'
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) =>
      res.rows[0]?.primitive_name === "Midnight-NullifierAndCommitment",
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

  // Note: swap transactions (initSwap + balanceUnprovenTransaction) DO emit
  // ZswapInput/ZswapOutput ledger events, just like transferTransaction — the
  // dedicated zswap test below asserts their exact values. (An older note here
  // claimed swaps emit no ZswapInput events; that observation came from the
  // since-removed hand-rolled event decoder, which misread the variant byte
  // and dropped events from non-zero segments.)
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

  // Commitment side of the same primitive: every shielded transfer creates
  // output coins (recipient + change), each emitting a ZswapOutput event.
  await assertSQL<{ count: string; commitment: string; mt_index: string }>(
    "Midnight: midnight_commitments has entries from shielded transfer",
    db,
    `SELECT COUNT(*)::text as count, MIN(commitment) as commitment, MIN(mt_index) as mt_index
     FROM midnight_commitments;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows[0];
      const count = parseInt(row?.count ?? "0", 10);
      console.log(`  Commitment count: ${count}`);
      return count >= 2 &&
        typeof row.commitment === "string" && row.commitment.length === 64 &&
        /^\d+$/.test(row.mt_index ?? "");
    },
  );

  // Zswap test case: submit a fresh swap (initSwap + balance + submit) and
  // assert the EXACT nullifiers and commitments read off the finalized swap
  // transaction end up captured by the NullifierAndCommitment primitive.
  // Nullifiers/commitments are globally unique, so exact-value matching
  // cannot be satisfied by rows from any other transaction.
  let zswap:
    | { txId: string; expectedNullifiers: string[]; expectedCommitments: string[] }
    | undefined;
  try {
    const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
    const { triggerZswap } = await import("../shared/contracts/midnight/faucet.ts");
    zswap = await triggerZswap(
      {
        indexer: midnightNetworkConfig.indexer,
        indexerWS: midnightNetworkConfig.indexerWS,
        node: midnightNetworkConfig.node,
        proofServer: midnightNetworkConfig.proofServer,
      },
      midnightNetworkConfig.id,
    );
  } catch (e) {
    console.error("Failed to trigger zswap (assertions below will fail):", e);
  }

  // Values are hex-validated before being embedded in the SQL literal.
  const isHex64 = (h: string): boolean => /^[0-9a-f]{64}$/.test(h);
  const expectedNullifiers = (zswap?.expectedNullifiers ?? []).filter(isHex64);
  const expectedCommitments = (zswap?.expectedCommitments ?? []).filter(isHex64);
  const inList = (vals: string[]): string =>
    vals.map((v) => `'${v}'`).join(", ") || "''";

  await assertSQL<{ nullifier: string }>(
    "Midnight: zswap inputs captured as the exact expected nullifiers",
    db,
    `SELECT nullifier FROM midnight_nullifiers
     WHERE nullifier IN (${inList(expectedNullifiers)});`,
    (res) =>
      expectedNullifiers.length > 0 &&
      res.rows.length >= expectedNullifiers.length,
    (res) => {
      console.log(
        `  zswap nullifiers captured: ${res.rows.length}/${expectedNullifiers.length}` +
          ` (txId ${zswap?.txId ?? "n/a"})`,
      );
      return res.rows.length === expectedNullifiers.length;
    },
  );

  await assertSQL<{ commitment: string; mt_index: string }>(
    "Midnight: zswap outputs captured as the exact expected commitments",
    db,
    `SELECT commitment, mt_index FROM midnight_commitments
     WHERE commitment IN (${inList(expectedCommitments)});`,
    (res) =>
      expectedCommitments.length > 0 &&
      res.rows.length >= expectedCommitments.length,
    (res) => {
      console.log(
        `  zswap commitments captured: ${res.rows.length}/${expectedCommitments.length}` +
          ` (txId ${zswap?.txId ?? "n/a"})`,
      );
      return res.rows.length === expectedCommitments.length &&
        res.rows.every((r) => /^\d+$/.test(r.mt_index));
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

  // UnshieldedSpend primitive: tracked (rows asserted by the swap test below)
  await assertSQL<{ primitive_name: string }>(
    "Midnight: primitive_accounting has Midnight-UnshieldedSpend entries",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Midnight-UnshieldedSpend'
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].primitive_name === "Midnight-UnshieldedSpend",
  );

  // Unshielded swap test case: a transaction with unshielded token deltas
  // (initSwap offer intent) COMPLETED by a separate balancing intent
  // (balanceFinalizedTransaction) was submitted by doTriggerUnshieldedSwap
  // (first in the trigger sequence — see its comment). Assert the exact marks
  // read off the merged transaction are captured by the primitives. There is
  // no nullifier/commitment for unshielded tokens — the canonical mark is the
  // (intentHash, outputIndex) of the UTXO's creating intent, so:
  //   - each spend must appear in midnight_unshielded_spends under the exact
  //     (intentHash, outputIndex) identity of the UTXO it consumed;
  //   - each created output must appear in midnight_unshielded_creates under
  //     one of the merged tx's intent hashes, with the exact value.
  // Values are hex-validated before being embedded in SQL literals.
  const isHex = (h: string): boolean => /^[0-9a-f]+$/.test(h);
  const spendPairs = (uswap?.expectedSpends ?? [])
    .filter((s) => isHex(s.intentHash));
  const candidateHashes = (uswap?.candidateIntentHashes ?? []).filter(isHex);
  const hashList = (vals: string[]): string =>
    vals.map((v) => `'${v}'`).join(", ") || "''";

  await assertSQL<{ intent_hash: string; output_index: number; value: string | null; token_type: string | null }>(
    "Midnight: unshielded swap spends captured with exact UTXO identities",
    db,
    `SELECT intent_hash, output_index, value, token_type FROM midnight_unshielded_spends
     WHERE intent_hash IN (${hashList(spendPairs.map((s) => s.intentHash))});`,
    (res) =>
      spendPairs.length > 0 &&
      spendPairs.every((s) =>
        res.rows.some((r) =>
          r.intent_hash === s.intentHash && r.output_index === s.outputIndex
        )
      ),
    (res) => {
      const matched = spendPairs.filter((s) =>
        res.rows.some((r) =>
          r.intent_hash === s.intentHash &&
          r.output_index === s.outputIndex &&
          (r.value ?? "") === s.value
        )
      );
      console.log(
        `  unshielded swap spends captured (id+value match): ${matched.length}/${spendPairs.length}` +
          ` (txId ${uswap?.txId ?? "n/a"}; sample token_type: ${res.rows[0]?.token_type ?? "n/a"})`,
      );
      return matched.length === spendPairs.length;
    },
  );

  await assertSQL<{ intent_hash: string; output_index: number; value: string | null; token_type: string | null }>(
    "Midnight: unshielded swap creates captured under the swap's intents",
    db,
    `SELECT intent_hash, output_index, value, token_type FROM midnight_unshielded_creates
     WHERE intent_hash IN (${hashList(candidateHashes)});`,
    (res) =>
      (uswap?.expectedCreateValues.length ?? 0) > 0 &&
      res.rows.length >= (uswap?.expectedCreateValues.length ?? 0),
    (res) => {
      const expected = [...(uswap?.expectedCreateValues ?? [])].sort();
      const got = res.rows.map((r) => r.value ?? "").sort();
      console.log(
        `  unshielded swap creates captured: ${res.rows.length} rows under swap intents;` +
          ` values expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}` +
          ` (sample token_type: ${res.rows[0]?.token_type ?? "n/a"})`,
      );
      // Every expected output value must be present among the rows created by
      // the swap's intents (the balancing intent may add change outputs, so
      // rows are a superset of the offer's outputs).
      const pool = [...got];
      return expected.every((v) => {
        const i = pool.indexOf(v);
        if (i === -1) return false;
        pool.splice(i, 1);
        return true;
      }) && res.rows.every((r) => r.output_index >= 0);
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
  // The primitive OWNS this table (needs no STM handler / migration). It's
  // published as primitives.midnight_token_mint_view_<instance>, where the
  // instance name "Midnight-TokenMint" is lowercased + stripped to a valid SQL
  // name. Owning it does not disable the STM: this suite also wires a
  // midnightTokenMintState handler, and L4 below asserts both paths ran.
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
  // with ledger-v9 for every row and require byte-equality with the stored
  // token_type. Proves the fetcher's derivation (and the row pairing) exact.
  await assert(
    "Midnight: every stored token_type equals rawTokenType(domain_sep, contract_address)",
    async () => {
      const { rawTokenType } = await import("@midnightntwrk/ledger-v9");
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

  // L4: the STM still fires for a primitive that owns its table. The consumer's
  // midnightTokenMintState handler writes midnight_token_mints; it must contain
  // exactly what the owned view holds. If the owned table ever suppressed STM
  // dispatch, this table would be empty while the view above stayed populated.
  await assertSQL<{
    token_type: string;
    kind: string;
    contract_address: string;
    domain_sep: string;
    total_minted: string;
    tx_hash: string | null;
  }>(
    "Midnight: STM handler also populated midnight_token_mints (owned table does not suppress STM)",
    db,
    `SELECT token_type, kind, contract_address, domain_sep, total_minted, tx_hash
     FROM midnight_token_mints ORDER BY token_type, kind;`,
    (res) => res.rows.length >= 2,
    (res) => {
      console.log(`  STM-written token-mint count: ${res.rows.length}`);
      const key = (r: { token_type: string; kind: string }) =>
        `${r.token_type.replace(/^0x/, "").toLowerCase()}:${r.kind}`;
      const viaView = new Map(mintsResult.rows.map((r) => [key(r), r]));
      if (res.rows.length !== mintsResult.rows.length) {
        console.error(
          `  row-count mismatch: STM ${res.rows.length} vs view ${mintsResult.rows.length}`,
        );
        return false;
      }
      for (const row of res.rows) {
        const viewRow = viaView.get(key(row));
        if (!viewRow) {
          console.error(`  STM row ${key(row)} missing from the owned view`);
          return false;
        }
        // total_minted is numeric(78,0) and the suite mints u64-max, so compare
        // as BigInt — Number() would make distinct values look equal above 2^53.
        if (
          viewRow.domain_sep.replace(/^0x/, "").toLowerCase() !==
            row.domain_sep.replace(/^0x/, "").toLowerCase() ||
          BigInt(viewRow.total_minted) !== BigInt(row.total_minted)
        ) {
          console.error(
            `  STM/view disagree for ${key(row)}: ` +
              `total_minted ${row.total_minted} vs ${viewRow.total_minted}`,
          );
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
    // contract mints to produce token-mint events. Every migration assertion
    // is mandatory: a trigger or assertion failure fails this run.
    const uswap = await doTriggerUnshieldedSwap();
    await doTriggerNullifiers();
    await doTriggerUnshieldedCreates();
    const minted = await doTriggerTokenMints();

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await runSyncTests(db, minted, uswap);

    // 6. Wait for batcher + run batcher tests
    await waitForProcess("batcher-wait", { waitForExit: true, timeoutMs: 120_000 });
    console.log("\n--- Phase 4: Batcher Tests ---\n");
    const { batcherTest } = await import("./sync/batcher.test.ts");
    await batcherTest();

    // 7. Summary
    printSummary();
  } catch (e) {
    recordCrash();
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
