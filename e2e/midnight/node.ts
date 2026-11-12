import {
  init,
  start,
  type StartConfigAppStateTransitions,
} from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { getConnection } from "@effectstream/db";

import { config } from "./config.ts";
import { grammar } from "./grammar.ts";

// -- State Machine ------------------------------------------------------------

const stm = new Stm<typeof grammar, {}>(grammar);

const pool = getConnection();

// MidnightGeneric (counter contract): writes parsed ledger payload to midnight_state
stm.addStateTransition("midnightContractState", function* (data) {
  const payload = data.parsedInput.payload;
  const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload);
  console.log(`[STM] midnightContractState: ${payloadJson}`);
  yield* World.promise(pool.query(
    "INSERT INTO midnight_state (block_height, primitive_name, payload_json) VALUES ($1, $2, $3)",
    [data.blockHeight, "midnightContractState", payloadJson],
  ));
});

// MidnightGeneric (eip-20 contract): writes parsed ledger payload to midnight_state
stm.addStateTransition("eip20ContractState", function* (data) {
  const payload = data.parsedInput.payload;
  const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload);
  console.log(`[STM] eip20ContractState: ${payloadJson}`);
  yield* World.promise(pool.query(
    "INSERT INTO midnight_state (block_height, primitive_name, payload_json) VALUES ($1, $2, $3)",
    [data.blockHeight, "eip20ContractState", payloadJson],
  ));
});

// MidnightNullifierAndCommitment: routes zswap events by kind —
// nullifiers to midnight_nullifiers, commitments to midnight_commitments
stm.addStateTransition("midnightZswapEventState", function* (data) {
  const { payload } = data.parsedInput;
  const txHash = payload?.txHash ?? "";
  if (payload?.kind === "commitment") {
    const commitment = payload?.commitment ?? JSON.stringify(payload);
    const mtIndex = payload?.mtIndex ?? "";
    console.log(`[STM] midnightZswapEventState: commitment=${commitment} mtIndex=${mtIndex} txHash=${txHash}`);
    yield* World.promise(pool.query(
      "INSERT INTO midnight_commitments (block_height, commitment, mt_index, tx_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (commitment) DO NOTHING",
      [data.blockHeight, commitment, mtIndex, txHash],
    ));
    return;
  }
  const nullifier = payload?.nullifier ?? JSON.stringify(payload);
  console.log(`[STM] midnightZswapEventState: nullifier=${nullifier} txHash=${txHash}`);
  yield* World.promise(pool.query(
    "INSERT INTO midnight_nullifiers (block_height, nullifier, tx_hash) VALUES ($1, $2, $3) ON CONFLICT (nullifier) DO NOTHING",
    [data.blockHeight, nullifier, txHash],
  ));
});

// MidnightUnshieldedCreate: writes unshielded UTXO creation events to
// midnight_unshielded_creates
// (payload: { owner, intentHash, outputIndex, value, tokenType, txHash }).
stm.addStateTransition("midnightUnshieldedCreateState", function* (data) {
  const { payload } = data.parsedInput;
  const owner = String(payload?.owner ?? "");
  const intentHash = String(payload?.intentHash ?? "");
  const outputIndex = Number(payload?.outputIndex ?? -1);
  const value = String(payload?.value ?? "");
  const tokenType = String(payload?.tokenType ?? "");
  const txHash = String(payload?.txHash ?? "");
  console.log(`[STM] midnightUnshieldedCreateState: owner=${owner.slice(0, 16)}… intentHash=${intentHash.slice(0, 16)}… outputIndex=${outputIndex} value=${value}`);
  yield* World.promise(pool.query(
    `INSERT INTO midnight_unshielded_creates (block_height, owner, intent_hash, output_index, value, token_type, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (owner, intent_hash, output_index) DO NOTHING`,
    [data.blockHeight, owner, intentHash, outputIndex, value, tokenType, txHash],
  ));
});

// MidnightUnshieldedSpend: writes unshielded UTXO spends to
// midnight_unshielded_spends. (intentHash, outputIndex) identifies the spent
// UTXO by its CREATING intent — the unshielded analog of a nullifier.
stm.addStateTransition("midnightUnshieldedSpendState", function* (data) {
  const { payload } = data.parsedInput;
  const owner = String(payload?.owner ?? "");
  const intentHash = String(payload?.intentHash ?? "");
  const outputIndex = Number(payload?.outputIndex ?? -1);
  const value = String(payload?.value ?? "");
  const tokenType = String(payload?.tokenType ?? "");
  const txHash = String(payload?.txHash ?? "");
  console.log(`[STM] midnightUnshieldedSpendState: owner=${owner.slice(0, 16)}… intentHash=${intentHash.slice(0, 16)}… outputIndex=${outputIndex} value=${value}`);
  yield* World.promise(pool.query(
    `INSERT INTO midnight_unshielded_spends (block_height, owner, intent_hash, output_index, value, token_type, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (intent_hash, output_index) DO NOTHING`,
    [data.blockHeight, owner, intentHash, outputIndex, value, tokenType, txHash],
  ));
});

// MidnightZswapRoot: tracks the coin-commitment tree root as it advances
// (payload: { root, txHash }). Re-observing an unchanged root refreshes the
// height — mirroring the ledger's past_roots re-insertion semantics.
stm.addStateTransition("midnightZswapRootState", function* (data) {
  const { payload } = data.parsedInput;
  const root = String(payload?.root ?? "");
  const txHash = String(payload?.txHash ?? "");
  console.log(`[STM] midnightZswapRootState: root=${root.slice(0, 18)}… txHash=${txHash.slice(0, 16)}…`);
  yield* World.promise(pool.query(
    `INSERT INTO midnight_zswap_roots (block_height, root, tx_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (root) DO UPDATE SET block_height = EXCLUDED.block_height`,
    [data.blockHeight, root, txHash],
  ));
});

// MidnightTokenMint: the primitive owns its registry table
// (primitives.midnight_token_mint_view_*, populated by a trigger on
// primitive_accounting) — a consumer that only wants the registry needs
// nothing but the `.addPrimitive(...)` line. The owned table does NOT replace
// the state machine though: with a stateMachinePrefix configured the primitive
// still emits an STM input per mint, and this handler runs alongside the
// trigger, writing the consumer's own midnight_token_mints table.
// Grammar is flat (builtinGrammars.midnightTokenMint), so parsedInput carries
// the named fields directly. The mapping is immutable, so conflicts only
// accumulate the running total.
stm.addStateTransition("midnightTokenMintState", function* (data) {
  const {
    rawTokenType: tokenType,
    kind,
    contractAddress,
    domainSep,
    amount,
    txHash,
  } = data.parsedInput;
  console.log(`[STM] midnightTokenMintState: token=${tokenType.slice(0, 16)}… kind=${kind} contract=${contractAddress.slice(0, 16)}… amount=${amount}`);
  yield* World.promise(pool.query(
    `INSERT INTO midnight_token_mints (block_height, token_type, kind, contract_address, domain_sep, total_minted, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (token_type, kind)
     DO UPDATE SET total_minted = midnight_token_mints.total_minted + EXCLUDED.total_minted`,
    [data.blockHeight, tokenType, kind, contractAddress, domainSep, amount, txHash],
  ));
});

const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// -- Migrations ---------------------------------------------------------------

import createUserTables from "./database/migrations/create-user-tables.sql" with { type: "text" };

const migrationTable: any[] = [
  { name: "create-user-tables", sql: createUserTables },
];

// -- Main ---------------------------------------------------------------------

main(function* () {
  yield* init();
  console.log("Starting E2E Midnight Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-midnight",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      grammar,
    });
  });

  yield* suspend();
});
