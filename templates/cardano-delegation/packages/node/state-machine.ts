import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { insertDelegation, updatePoolStats } from "@cardano-delegation/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

// ──────────────────────────────────────────────────────────────────────────────
// State Machine Transition: cardano-pool-delegation
//
// This is where on-chain data becomes application state. The pipeline:
//
//   1. Dolos streams raw Cardano blocks via UTxORPC (gRPC Watch)
//   2. WatchMultiplexer receives txs with delegation certificates
//   3. CardanoPoolDelegationPrimitive.getPayload() extracts:
//        - address: staking credential hash (hex)
//        - pool:    pool operator keyhash (hex)
//        - epoch:   computed from slot number + network params
//   4. The primitive schedules this data via generateRawStmInput()
//   5. This transition receives the parsed input below and writes to the DB
//
// Input shape (from the primitive's grammar):
//   { address: string, pool: string, epoch: string }
//
// To add your own logic: modify the body below. You have access to
// data.blockHeight, data.blockTimestamp, and the full parsedInput.
// Use `yield* World.resolve(query, params)` to run pgtyped queries.
// ──────────────────────────────────────────────────────────────────────────────
stm.addStateTransition("cardano-pool-delegation", function* (data) {
  const { address, pool, epoch } = data.parsedInput as {
    address: string;
    pool: string;
    epoch: string;
  };

  if (!address || !pool) return;

  console.log([
    "",
    "╔══════════════════════════════════════════════════════════════╗",
    "║              NEW DELEGATION INDEXED FROM CHAIN              ║",
    "╠══════════════════════════════════════════════════════════════╣",
    `║  Block:  ${String(data.blockHeight).padEnd(49)}║`,
    `║  Epoch:  ${epoch.padEnd(49)}║`,
    `║  Cred:   ${address.slice(0, 48).padEnd(49)}║`,
    `║  Pool:   ${pool.slice(0, 48).padEnd(49)}║`,
    "╚══════════════════════════════════════════════════════════════╝",
    "",
  ].join("\n"));

  yield* World.resolve(insertDelegation, {
    block_height: data.blockHeight,
    address,
    pool,
    epoch,
    tx_hash: null,
  });

  yield* World.resolve(updatePoolStats, {
    pool,
    latest_epoch: epoch,
    latest_block: data.blockHeight,
  });
});

export const appStateTransitions: StartConfigAppStateTransitions =
  function* (
    blockHeight: number,
    input: BaseStfInput,
  ): SyncStateUpdateStream<void> {
    yield* stm.processInput(input);
  };
