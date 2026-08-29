/**
 * One file, six declared dependencies. Run `bun install && bun start`, then open
 * http://localhost:9999.
 *
 * A read-only Effectstream node: it follows one deployed Midnight contract on
 * Stagenet, decodes its public `round` ledger field, and serves it as HTML. It
 * needs no wallet, seed, proof server, faucet, or compiled contract, and it
 * never submits a transaction.
 *
 * Everything below is the ordinary public composition language the maintained
 * templates use — `ConfigBuilder`, `toSyncProtocolWithNetwork`,
 * `withEffectstreamStaticConfig`, `Stm`, `init`, `start`, and Effection resource
 * scopes. There is deliberately no single-file wrapper: this file is the honest
 * baseline that any future convenience API has to beat.
 */
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { startPglite } from "@effectstream/db/start-pglite";
import { defaultMidnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { init, start } from "@effectstream/runtime";
import { Stm, type BaseStfInput } from "@effectstream/sm";
import { PrimitiveTypeMidnightGeneric } from "@effectstream/sm/builtin";
import { builtinGrammars } from "@effectstream/sm/grammar";
import { call, ensure, main, suspend } from "effection";

/**
 * The endpoint profile is owned by `@effectstream/midnight-contracts`, never
 * copied here: this resolves Stagenet's indexer, node and network id.
 */
const midnight = defaultMidnightNetworkConfig("stagenet");

/** The deployed contract this node follows, and the block it was created in. */
const CONTRACT_ADDRESS =
  "38317e99d1f43362a67187a00496727ff23fe8a174cc1836a4ce9c492ab48012";
const START_BLOCK_HEIGHT = 232_938;

/**
 * Ports. `0` lets the OS pick a free port for the embedded database, which is
 * what a single developer machine wants; a test harness can pin both ports.
 */
const requestedDbPort = readPort("DB_PORT", 0);
const apiPort = readPort("EFFECTSTREAM_API_PORT", 9999);

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${name} must be an integer from 0 to 65535, got ${raw}`);
  }
  return port;
}

/**
 * The latest decoded value, rendered by the API below. `appliedAtBlock` is this
 * node's own merged block height, not a Midnight chain height.
 */
let round = "waiting for the next contract update";
let appliedAtBlock: number | undefined;

const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("single-file"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: Date.now(),
        blockTimeMS: 1_000,
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: midnight.networkId,
      })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        () => ({
          name: "ntp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          startBlockHeight: 1,
          pollingInterval: 1_000,
        }),
      )
      .addParallel(
        (networks) => networks.midnight,
        () => ({
          name: "midnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          indexer: midnight.indexer,
          startBlockHeight: START_BLOCK_HEIGHT,
          pollingInterval: 6_000,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (protocols) => protocols.midnight,
      () => ({
        name: "round",
        type: PrimitiveTypeMidnightGeneric,
        contractAddress: CONTRACT_ADDRESS,
        startBlockHeight: START_BLOCK_HEIGHT,
        stateMachinePrefix: "round",
        // Public ledger fields in Compact declaration order.
        ledgerSchema: { round: "uint128" },
        networkId: midnight.networkId,
      }),
    )
  )
  .build();

const grammar = { round: builtinGrammars.midnightGeneric } as const;
const stateMachine = new Stm<typeof grammar, {}>(grammar);
stateMachine.addStateTransition("round", function* (data) {
  round = String(data.parsedInput.payload.round);
  appliedAtBlock = Number(data.blockHeight);
});

// The engine reads its database and event settings from the environment. This
// node owns an embedded PGlite and publishes no MQTT events, so it says so
// explicitly rather than relying on the defaults.
process.env.PGLITE = "true";
process.env.PGLITE_DATA_DIR = "memory://";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_USER = "postgres";
process.env.DB_NAME = "postgres";
process.env.MQTT_BROKER = "false";
process.env.EFFECTSTREAM_API_PORT = String(apiPort);

main(function* () {
  // Acquire the database inside the scope, and register its forced close before
  // anything else can fail: a failed readiness check, a runtime that cannot bind
  // its port, SIGINT and SIGTERM must all unwind through this same `ensure`.
  const database = yield* call(() => startPglite(requestedDbPort));
  yield* ensure(function* () {
    yield* call(() => database.close({ force: true }));
  });
  process.env.DB_PORT = String(database.port);
  yield* call(() => database.db.waitReady);

  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "single-file",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      grammar,
      gameStateTransitions: function* (_height: number, input: BaseStfInput) {
        yield* stateMachine.processInput(input);
      },
      events: false,
      apiRouter: async (server) => {
        server.get("/", async (_request, reply) =>
          reply.type("text/html").send(`<!doctype html>
            <title>Effectstream + Midnight</title>
            <h1>Effectstream + Midnight</h1>
            <p>Network: ${midnight.networkId}</p>
            <p>Contract: ${CONTRACT_ADDRESS}</p>
            <p>Round: ${round}</p>
            <p>Midnight start block: ${START_BLOCK_HEIGHT}</p>
            <p>Applied in Effectstream block: ${appliedAtBlock ?? "—"}</p>`));
      },
    });
  });
  yield* suspend();
});
