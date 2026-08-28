import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { StateMachine } from "@effectstream/sm";
import {
  runEffectstream,
  type RunEffectstreamOptions,
} from "../src/mod.ts";

const config = new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  .buildSyncProtocols((builder) =>
    builder.addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: "latest",
      }),
    )
  )
  .buildPrimitives((builder) => builder)
  .build();

const stateMachine = new StateMachine();
const apiRouter = async () => {};

const minimal = {
  appName: "minimal",
  appVersion: "1.0.0",
  config,
  stateMachine,
  apiRouter,
} as const satisfies RunEffectstreamOptions;

void runEffectstream(minimal);
void runEffectstream({
  ...minimal,
  database: { type: "pglite", dataDir: "", port: 12_345 },
  messaging: true,
  signal: new AbortController().signal,
  processSignals: ["SIGINT", "SIGTERM"],
});
void runEffectstream({
  ...minimal,
  database: {
    type: "postgres",
    host: "127.0.0.1",
    port: 15_432,
    user: "postgres",
    database: "postgres",
    password: "",
  },
});

// @ts-expect-error The replaced legacy aggregate is not a canonical option.
void runEffectstream({ staticConfig: {}, startConfig: {} });

// @ts-expect-error All five application fields are required.
const missingMachine: RunEffectstreamOptions = {
  appName: "missing-machine",
  appVersion: "1.0.0",
  config,
  apiRouter,
};
void missingMachine;

void runEffectstream({
  ...minimal,
  // @ts-expect-error No API-port option is part of the canonical runner.
  apiPort: 12_345,
});
void runEffectstream({
  ...minimal,
  // @ts-expect-error The canonical runner accepts only a complete built config.
  config: {},
});
void runEffectstream({
  ...minimal,
  // @ts-expect-error PostgreSQL database is required.
  database: {
    type: "postgres",
    host: "127.0.0.1",
    port: 15_432,
    user: "postgres",
    password: "secret",
  },
});
void runEffectstream({
  ...minimal,
  database: {
    type: "pglite",
    // @ts-expect-error PostgreSQL fields are not accepted in PGlite mode.
    host: "127.0.0.1",
  },
});
