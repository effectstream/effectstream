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
import createUserTables from "./database/migrations/create-user-tables.sql" with { type: "text" };

// ── State Machine ────────────────────────────────────────────────────────────

const pool = getConnection();
const stm = new Stm<typeof grammar, {}>(grammar);

// UTXORpc Generic: indexes Cardano transactions matching the address predicate
stm.addStateTransition("cardano-utxo-rpc-generic", function* (data) {
  const { hash, bytes } = data.parsedInput;
  console.log(`[STM] cardano-utxo: hash=${hash}`);
  yield* World.promise(pool.query(
    "INSERT INTO cardano_transactions (block_height, tx_hash, bytes_hex) VALUES ($1, $2, $3)",
    [data.blockHeight, hash, bytes],
  ));
});

// ── Cardano Primitive STM Transitions ─────────────────────────────────────

stm.addStateTransition("cardano-mint-burn", function* (data) {
  const { txId, metadata, assets, inputAddresses, outputAddresses } = data.parsedInput;
  console.log(`[STM] cardano-mint-burn: txId=${txId}`);
  yield* World.promise(pool.query(
    `INSERT INTO cardano_mint_burn_events (block_height, tx_id, metadata, assets, input_addresses, output_addresses)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [data.blockHeight, txId, metadata || null, assets, inputAddresses, outputAddresses],
  ));
});

stm.addStateTransition("cardano-transfer", function* (data) {
  const { txId, metadata, inputCredentials, outputs, signerKeyHashes } =
    data.parsedInput;
  console.log(`[STM] cardano-transfer: txId=${txId}`);
  yield* World.promise(pool.query(
    `INSERT INTO cardano_transfers (block_height, tx_id, metadata, input_credentials, outputs, signer_key_hashes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      data.blockHeight,
      txId,
      metadata || null,
      inputCredentials,
      outputs,
      signerKeyHashes,
    ],
  ));
});

stm.addStateTransition("cardano-pool-delegation", function* (data) {
  const { address, pool: poolHash, epoch } = data.parsedInput;
  console.log(`[STM] cardano-pool-delegation: addr=${address} pool=${poolHash} epoch=${epoch}`);
  yield* World.promise(pool.query(
    `INSERT INTO cardano_delegations (block_height, address, pool, epoch)
     VALUES ($1, $2, $3, $4)`,
    [data.blockHeight, address, poolHash, epoch],
  ));
});

stm.addStateTransition("cardano-delayed-asset", function* (data) {
  const { address, txId, outputIndex, cip14Fingerprint, amount, policyId, assetName } = data.parsedInput;
  console.log(`[STM] cardano-delayed-asset: txId=${txId} idx=${outputIndex} amount=${amount}`);
  yield* World.promise(pool.query(
    `INSERT INTO cardano_asset_utxos (block_height, address, tx_id, output_index, cip14_fingerprint, amount, policy_id, asset_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [data.blockHeight, address, txId, outputIndex, cip14Fingerprint, amount || null, policyId, assetName],
  ));
});

stm.addStateTransition("cardano-projected-nft", function* (data) {
  const { ownerAddress, previousTxId, previousOutputIndex, currentTxId, currentOutputIndex, policyId, assetName, status, forHowLong } = data.parsedInput;
  console.log(`[STM] cardano-projected-nft: owner=${ownerAddress} status=${status}`);
  yield* World.promise(pool.query(
    `INSERT INTO cardano_projected_nfts (block_height, owner_address, previous_tx_id, previous_output_index, current_tx_id, current_output_index, policy_id, asset_name, status, for_how_long)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [data.blockHeight, ownerAddress, previousTxId || null, previousOutputIndex || null, currentTxId, currentOutputIndex || null, policyId, assetName, status, forHowLong || null],
  ));
});

const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting E2E Cardano Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-cardano",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      grammar,
      migrations: [
        { name: "create-user-tables", sql: createUserTables },
      ],
    });
  });

  yield* suspend();
});
