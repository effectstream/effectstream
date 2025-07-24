#!/usr/bin/env -S deno run --allow-all
import { ENV, type ValueOf } from "@paima/utils";
import "./http-server.ts";
import { dkill } from "@sylc/dkill";

import {
  initTelemetry,
  logHandler,
  rawLogHandler,
  setCollectorStarted,
  setCurrentOutput,
} from "./logging.ts";
import {
  $,
  AbortProcessStart,
  type ProcessComponent,
  shutdown,
} from "./process.ts";
import { ComponentNames } from "@paima/log";
import { installTmux, Tmux } from "./tmux/tmux.ts";
import type { LaunchableComponents } from "@paima/log";
import { type Static, Type } from "@sinclair/typebox";

Deno.addSignalListener("SIGINT", () => {
  shutdown(0);
});

/**
 * Orchestrator configurations
 * logs: log output mode
 * killProcessesByPort: ports to kill on startup
 * processes: components to start
 */
export const OrchestratorConfig = Type.Object({
  logs: Type.Union([
    Type.Literal("none"),
    Type.Literal("stdout-err"),
    Type.Literal("stdout"),
    Type.Literal("development"),
    Type.Literal("production"),
  ], { default: "development" }),

  kill: Type.Object({
    auto: Type.Boolean({ default: true }),

    // External configured ports.
    hardhat: Type.Array(Type.Number(), {
      default: [8545, 8546],
    }),
    // TODO "kill" is a workaround to kill any processes that are still running from a previous run.
    //
    // Cardano processes 8090, 10000. Do not terminate cleanly.
    // Unfortunately required because of https://github.com/bloxbean/yaci-devkit/issues/94
    //
    // PGLite 5432. Frequently does not shutdown in some cases.
    //
    // Hardhat 8545. Sometimes it does not shutdown cleanly when the node crashes.
    //
    // Batcher 3334. Sometimes it does not shutdown cleanly when the node crashes.
    //
    yaciDevkit: Type.Array(Type.Number(), {
      default: [8090, 10000, 50051, 3001],
    }),
  }, { default: {} }),

  // Batcher options.
  // Also set: processes[ComponentNames.PAIMA_BATCHER] = true
  batcher: Type.Optional(Type.Object({
    paimaL2Address: Type.String(),
    batcherPrivateKey: Type.String(),
    chainName: Type.String(),
  })),

  // Processes to start
  processes: Type.Object({
    // Main Processes
    [ComponentNames.PAIMA_SYNC]: Type.Boolean({ default: true }),

    // Dev Tools
    [ComponentNames.CHECKER]: Type.Boolean({ default: true }),

    [ComponentNames.PAIMA_DB]: Type.Boolean({ default: false }),

    [ComponentNames.HARDHAT]: Type.Boolean({ default: false }),
    [ComponentNames.DEPLOY_EVM_CONTRACTS]: Type.Boolean({ default: false }),
    [ComponentNames.YACI_DEVKIT]: Type.Boolean({ default: false }),
    [ComponentNames.DOLOS]: Type.Boolean({ default: false }),

    // DevOps
    [ComponentNames.COLLECTOR]: Type.Boolean({ default: true }),
    [ComponentNames.PAIMA_BATCHER]: Type.Boolean({ default: true }),
    [ComponentNames.DOCS]: Type.Boolean({ default: true }),
    // TODO: Explorer crashes when launching process through Deno.command
    [ComponentNames.EXPLORER]: Type.Boolean({ default: false }),
    [ComponentNames.TMUX]: Type.Boolean({ default: true }),
  }, { default: {} }),
});

type OrchestratorConfigType = Static<typeof OrchestratorConfig>;

export async function start(
  config: OrchestratorConfigType,
): Promise<void> {
  // Let's setup the output mode
  // Config options:
  //   none: no logs
  //   stdout-err: print only errors to terminal - This mode is used by tests, so only errors are printed
  //   stdout: print all logs to terminal - This mode is used by test in dev mode.
  //   development: send only to OTEL collector - Default mode.
  //   production: send to OTEL collector and print to terminal
  switch (config.logs) {
    case "none":
      setCurrentOutput([]);
      break;
    case "stdout-err":
      setCurrentOutput(["stderr"]);
      break;
    case "stdout":
      // TODO: This is a hack to force the logs to be printed to stdout.
      Deno.env.set("PAIMA_LOGS_FORCE_STDOUT", "true");
      setCurrentOutput(["stdout"]);
      break;
    case "development":
      setCurrentOutput(["otel"]);
      initTelemetry();
      break;
    case "production":
      setCurrentOutput(["otel", "stdout"]);
      initTelemetry();
      break;
  }

  try {
    const startProcess = processFactory(config);
    // This is a 2D array of functions that launch processes.
    // The outer array is for processes that are launched in sequence.
    // The inner array is for processes that are launched in parallel.
    const processesToLaunch: (false | (() => Promise<ProcessComponent>))[][] =
      [];

    // fast-fail if there are type errors in the project
    if (config.processes[ComponentNames.CHECKER]) {
      processesToLaunch.push([startProcess[ComponentNames.CHECKER]]);
    }

    if (config.processes[ComponentNames.TMUX]) {
      processesToLaunch.push([startProcess[ComponentNames.TMUX]]);
    }

    if (config.processes[ComponentNames.COLLECTOR]) {
      processesToLaunch.push([startProcess[ComponentNames.COLLECTOR]]);
    }

    // First batch of processes that have no other dependencies
    processesToLaunch.push([
      config.processes[ComponentNames.DOCS] &&
      startProcess[ComponentNames.DOCS],
      config.processes[ComponentNames.PAIMA_DB] &&
      startProcess[ComponentNames.PAIMA_DB],
      config.processes[ComponentNames.YACI_DEVKIT] &&
      startProcess[ComponentNames.YACI_DEVKIT],
      config.processes[ComponentNames.HARDHAT] &&
      startProcess[ComponentNames.HARDHAT],
    ]);

    processesToLaunch.push([
      // Start the Dolos process. Depends on YaciDevkit.
      config.processes[ComponentNames.DOLOS] &&
      startProcess[ComponentNames.DOLOS],
      // Deploy the contracts. Depends on Hardhat.
      config.processes[ComponentNames.DEPLOY_EVM_CONTRACTS] &&
      startProcess[ComponentNames.DEPLOY_EVM_CONTRACTS],
    ]);

    // Start the batcher, after the contracts are deployed.
    processesToLaunch.push([
      config.processes[ComponentNames.PAIMA_BATCHER] &&
      startProcess[ComponentNames.PAIMA_BATCHER],
    ]);

    // Start the explorer
    // This crashes when launching process through Deno.command
    processesToLaunch.push([
      config.processes[ComponentNames.EXPLORER] &&
      startProcess[ComponentNames.EXPLORER],
    ]);

    // Start the main process
    processesToLaunch.push([
      config.processes[ComponentNames.PAIMA_SYNC] &&
      startProcess[ComponentNames.PAIMA_SYNC],
    ]);

    // Launch outer processes in sequence, and inner processes in parallel
    for (const batch of processesToLaunch) {
      await Promise.all(batch.map((p) => p && p()));
    }
  } catch (e) {
    if (!(e instanceof AbortProcessStart)) {
      console.error(e);
    }
    await shutdown(1);
  }
}

export const abortControllers = {
  // Abort controller for all critical processes
  system: new AbortController(),
  // Abort controller for all non-critical processes
  noncritical: new AbortController(),
  // Abort controller for Developer UI
  developerUI: new AbortController(),
};

export const processFactory = (config: OrchestratorConfigType): Record<
  ValueOf<typeof LaunchableComponents>,
  () => Promise<ProcessComponent>
> => ({
  [ComponentNames.TMUX]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.TUI_LOG_PORT] });
    }

    await installTmux();
    const session_name = "paima-" + Date.now();

    const tm = new Tmux({});
    await tm.init();
    await tm.newSession(session_name);

    // We can pass a custom launch json file to the tmux instance
    await tm.readLaunchJson(session_name);

    const tmux = $({
      ...tm.getAttachSessionCommand(session_name),
      component: ComponentNames.TMUX,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      abortController: abortControllers.developerUI,
    });
    tmux.process.unref();

    return tmux;
  },

  [ComponentNames.EXPLORER]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.PAIMA_EXPLORER_PORT] });
    }
    const explorer = $({
      args: ["task", "-f", "@paima/explorer", "dev"],
      component: ComponentNames.EXPLORER,
      log: rawLogHandler,
      abortController: abortControllers.developerUI,
    });
    await explorer.process.status;
    return explorer;
  },

  [ComponentNames.DOCS]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.DOCS_PORT] });
    }

    const docs = $({
      args: ["task", "-f", "@paima/docs", "start"],
      component: ComponentNames.DOCS,
      abortController: abortControllers.developerUI,
    });
    void docs.process.status;
    return docs;
  },

  [ComponentNames.DEPLOY_EVM_CONTRACTS]: async (): Promise<
    ProcessComponent
  > => {
    const deploy = $({
      args: ["task", "-f", "@example/evm-contracts", "deploy"],
      component: ComponentNames.DEPLOY_EVM_CONTRACTS,
      log: rawLogHandler,
      abortController: abortControllers.system,
    });

    await Promise.all([deploy.process.status]);
    return deploy;
  },

  [ComponentNames.COLLECTOR]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.OTEL_COLLECTOR_PORT] });
    }

    const otlpCollector = $({
      args: ["task", "-f", "@paima/collector", "start"],
      // collector always has to post logs directly to console
      // otherwise, it gets stuck in an infinite loop of sending to itself
      log: rawLogHandler,
      component: ComponentNames.COLLECTOR,
      abortController: abortControllers.noncritical,
    });
    void Promise.all([otlpCollector.process.status]);

    const waitOtlp = $({
      args: ["task", "-f", "@paima/collector", "wait"],
      // collector always has to post logs directly to console
      // otherwise, it gets stuck in an infinite loop of sending to itself
      log: rawLogHandler,
      component: ComponentNames.COLLECTOR_WAIT,
      abortController: abortControllers.noncritical,
    });
    await Promise.all([waitOtlp.process.status]);
    setCollectorStarted();
    return otlpCollector;
  },

  [ComponentNames.CHECKER]: async (): Promise<ProcessComponent> => {
    const checker = $({
      args: ["task", "check"],
      component: ComponentNames.CHECKER,
      stdout: "inherit",
      stderr: "inherit",
      abortController: abortControllers.noncritical,
    });
    await Promise.all([checker.process.status]);
    return checker;
  },

  [ComponentNames.PAIMA_SYNC]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.PAIMA_API_PORT] });
    }

    const node = $({
      args: ["task", "node:start"],
      log: rawLogHandler,
      component: ComponentNames.PAIMA_SYNC,
      namespace: [], // these should get a "paima" namespace added to them automatically
      abortController: abortControllers.system,
    });
    await Promise.all([node.process.status]);
    return node;
  },

  [ComponentNames.PAIMA_BATCHER]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.BATCHER_PORT] });
    }

    // TODO This should be read from the config.
    const paimaL2Address = config.batcher?.paimaL2Address;
    const batcherPrivateKey = config.batcher?.batcherPrivateKey;
    const chainName = config.batcher?.chainName;
    const batcher = $({
      args: [
        "task",
        "-f",
        "@paima/batcher",
        "standalone",
        `--paimaL2Address=${paimaL2Address}`,
        `--batcherPrivateKey=${batcherPrivateKey}`,
        `--chainName=${chainName}`,
      ],
      log: rawLogHandler,
      component: ComponentNames.PAIMA_BATCHER,
      abortController: abortControllers.system,
      namespace: [],
    });
    // This is a long-lasting service that does not exit.
    void batcher.process.status;
    return batcher;
  },

  [ComponentNames.HARDHAT]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: config.kill.hardhat });
    }

    // TODO: some way to specify which chains should be used for a project
    const hardhat = $({
      // TODO This should be read from the config.
      args: ["task", "-f", "@example/evm-contracts", "chain:start"],
      log: logHandler,
      component: ComponentNames.HARDHAT,
      abortController: abortControllers.system,
    });
    void hardhat.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@example/evm-contracts", "chain:wait"],
      component: ComponentNames.HARDHAT_WAIT,
      abortController: abortControllers.noncritical,
    }).process.status;

    return hardhat;
  },

  [ComponentNames.YACI_DEVKIT]: async (): Promise<ProcessComponent> => {
    // Yaci Devkit Ports
    if (config.kill.auto) {
      await dkill({ ports: config.kill.yaciDevkit });
    }

    const yaciDevkit = $({
      args: ["task", "-f", "@example/cardano-contracts", "devkit:start"],
      log: logHandler,
      component: ComponentNames.YACI_DEVKIT,
      abortController: abortControllers.system,
    });
    void yaciDevkit.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@example/cardano-contracts", "devkit:wait"],
      component: ComponentNames.YACI_DEVKIT_WAIT,
      abortController: abortControllers.noncritical,
    })
      .process.status;
    return yaciDevkit;
  },

  [ComponentNames.DOLOS]: async (): Promise<ProcessComponent> => {
    const dolos = $({
      args: ["task", "-f", "@example/cardano-contracts", "dolos:start"],
      // use this until Dolos supports otel: https://github.com/txpipe/dolos/issues/399
      log: (chunk) =>
        rawLogHandler(chunk, "stdout", ComponentNames.DOLOS, "dolos"),
      component: ComponentNames.DOLOS,
      abortController: abortControllers.system,
    });
    void dolos.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@example/cardano-contracts", "dolos:wait"],
      component: ComponentNames.DOLOS_WAIT,
      abortController: abortControllers.noncritical,
    })
      .process.status;

    return dolos;
  },

  [ComponentNames.PAIMA_DB]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.DB_PORT] });
    }

    const paimaDb = $({
      // TODO: run pgtyped:up only depending on parameters?
      args: ["task", "-f", "@paima/db", "db:up"],
      log: logHandler,
      component: ComponentNames.PAIMA_DB,
      abortController: abortControllers.system,
    });
    void paimaDb.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@paima/db", "db:wait"],
      component: ComponentNames.PAIMA_DB_WAIT,
      abortController: abortControllers.noncritical,
    }).process.status;

    return paimaDb;
  },
});
