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
import { getConnection } from "@effectstream/db";
import { main, spawn, suspend } from "effection";
import { toSyncProtocolWithNetwork, withEffectstreamStaticConfig } from "@effectstream/config";
import { migrationTable } from "@solana-midnight-bridge/database";
import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import {
  buildBridgeConfig,
  checkSolanaGenesis,
  describeSettings,
  loadBridgeNodeSettings,
  parseNodeMode,
  resolveNtpStartTime,
} from "./config.ts";
import { createBridgeStateMachine } from "./state-machine.ts";
import { createApiRouter } from "./api.ts";
import { assertContractDeliverySchema, SCHEMA_WIPE_MESSAGE } from "./schema-check.ts";
import { buildDeploymentRecord, liveRecordReads, verifyRecordInBackground } from "./record.ts";
import { grammar } from "./grammar.ts";
import { startRelayer } from "./relayer/mod.ts";
import { createDelivery, deliveryConfig, deliveryInfos } from "./relayer/delivery.ts";

const mode = parseNodeMode(process.argv[2] ?? process.env.BRIDGE_MODE);
const settings = loadBridgeNodeSettings(mode);

// 00058 start-up checks: the Solana RPC is the deployment's cluster (FR-010), and the database
// is not an older node's (D-6: a new migration never runs on a database synced past block 1).
const refuse = (what: string, e: unknown): never => {
  console.error(`[bridge-node] ${what}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};
await checkSolanaGenesis(settings).catch((e) => refuse("Solana genesis check", e));
try {
  const v = await assertContractDeliverySchema((text, values) => getConnection().query(text, values as any[]));
  if (!v.fresh) console.log("[bridge-node] database schema has the contract-delivery columns");
} catch (e) {
  if (e instanceof Error && e.message.startsWith(SCHEMA_WIPE_MESSAGE)) refuse("database schema", e);
  // The database is not reachable yet: the runtime connects (and fails) on its own.
  console.warn(`[bridge-node] could not check the database schema yet: ${e instanceof Error ? e.message : String(e)}`);
}
// 00058: delivery into contracts (D-1). The adapters are checked here (the Passport bundle against
// its pin, FR-006): a failure refuses to start. With the relayer off there is no router, and
// GET /recipients answers 503.
const relayerOn = process.env.BRIDGE_RELAYER !== "0";
const deliveryCfg = (() => {
  try {
    return deliveryConfig();
  } catch (e) {
    return refuse("delivery configuration", e);
  }
})();
const delivery = relayerOn ? await createDelivery(settings, deliveryCfg).catch((e) => refuse("contract delivery", e)) : null;
// GET /deployment: the record, once verified against both chains (I-3 (c)).
const publicApi = process.env.BRIDGE_PUBLIC_API ?? `http://127.0.0.1:${process.env.EFFECTSTREAM_API_PORT ?? "9999"}`;
const record = verifyRecordInBackground({
  build: () => buildDeploymentRecord(settings, liveRecordReads(settings.solanaRpcUrl, settings.midnightUrls), {
    api: publicApi,
    ...(process.env.BRIDGE_RECORD_NAME ? { name: process.env.BRIDGE_RECORD_NAME } : {}),
    ...(process.env.BRIDGE_RECORD_SYMBOL ? { symbol: process.env.BRIDGE_RECORD_SYMBOL } : {}),
    adapters: delivery?.infos ?? deliveryInfos(deliveryCfg),
  }),
});
const apiRouter = createApiRouter({ deploymentRecord: record.current, recognise: () => delivery?.recognise ?? null });
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
  yield* spawn(() => startRelayer(settings, delivery));

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
