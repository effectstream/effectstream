// The bridge's Effectstream node: `bun run main.ts <local|live>`.
//
// Sync (config.ts) feeds the state machine (state-machine.ts), which owns
// bridge_transfers; the read-only API is api.ts. The relayer (relayer/) runs in
// this same process, spawned before start() as in templates/preorder;
// BRIDGE_RELAYER=0 disables it.
//
// Outside the orchestrator a node needs a Postgres-wire database first
// (`startPglite`); the orchestrator's `pglite` process provides it.
await import("@midnight-ntwrk/onchain-runtime");

import { init, start } from "@effectstream/runtime";
import { main, spawn, suspend } from "effection";
import { toSyncProtocolWithNetwork, withEffectstreamStaticConfig } from "@effectstream/config";
import { migrationTable } from "@solana-midnight-bridge/database";
import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import {
  buildBridgeConfig,
  describeSettings,
  loadBridgeNodeSettings,
  parseNodeMode,
  resolveNtpStartTime,
} from "./config.ts";
import { createBridgeStateMachine } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "./grammar.ts";
import { startRelayer } from "./relayer/mod.ts";

const mode = parseNodeMode(process.argv[2] ?? process.env.BRIDGE_MODE);
const settings = loadBridgeNodeSettings(mode);
const ntpStartTime = await resolveNtpStartTime(settings);
const config = buildBridgeConfig(settings, ntpStartTime);
const { gameStateTransitions } = createBridgeStateMachine({
  programId: settings.solana.programId,
  mint: settings.solana.mint,
  sourceMintHex: Buffer.from(new PublicKey(settings.solana.mint).toBytes()).toString("hex"),
});

main(function* () {
  yield* init();
  console.log(`[bridge-node] ${describeSettings(settings)} ntpStart=${new Date(ntpStartTime).toISOString()}`);

  // The relayer polls bridge_transfers; spawn it before start(), which never
  // returns control (templates/preorder pattern).
  yield* spawn(() => startRelayer(settings));

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "solana-midnight-bridge",
      appVersion: "0.1.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
