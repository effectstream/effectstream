#!/usr/bin/env -S deno run --allow-all
import { ENV } from "@paima/utils/node-env";
import type { ValueOf } from "@paima/utils";
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

let appConfig: OrchestratorConfigType | null = null;
let pFactory: ReturnType<typeof processFactory> | null = null;

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
  // Log options.
  logs: Type.Union([
    // No logs
    Type.Literal("none"),
    // Print only errors to terminal
    Type.Literal("stdout-err"),
    // Print all logs to terminal
    Type.Literal("stdout"),
    // Send only to OTEL collector
    Type.Literal("development"),
    // Send to OTEL collector and print to terminal
    Type.Literal("production"),
  ], { default: "development" }),

  // This kills default processes that are open in specific ports.
  kill: Type.Object({
    // TODO: kill.auto is workaround to kill processes that are still running from a previous run.
    //       PGLite 5432. Frequently does not shutdown in some cases.
    //       Batcher 3334. Sometimes it does not shutdown cleanly when the node crashes.
    //       And other ports are checked.
    auto: Type.Boolean({ default: true }),
  }, { default: {} }),

  // Custom user defined processes to launch.
  // For example you can launch hardhat evm chains, wait to be ready and deploy contracts.
  processesToLaunch: Type.Array(
    Type.Object({
      description: Type.String({ default: "" }),
      stopProcessAtPort: Type.Array(Type.Number(), { default: [] }),
      processes: Type.Array(
        Type.Object({
          name: Type.String(),
          args: Type.Array(Type.String()),
          waitToExit: Type.Boolean({ default: true }),
          link: Type.String({ default: "" }),
          logs: Type.Union([
            Type.Literal("otel-compatible"),
            Type.Literal("raw"),
            Type.Literal("none"),
          ], { default: "raw" }),
          type: Type.Union([
            Type.Literal("system-dependency"),
            Type.Literal("secondary"),
          ], { default: "secondary" }),
        }),
        { default: [] },
      ),
    }),
    { default: [] },
  ),

  // This can be customized for different locations of the packages.
  // nightly: jsr:@paimaexample
  // release: jsr:@paima
  // local development: @paima
  packageName: Type.String({ default: "jsr:@paima" }),
  packageVersion: Type.String({ default: "" }),

  // Processes to start
  processes: Type.Object({
    // Main Processes
    [ComponentNames.PAIMA_SYNC]: Type.Boolean({ default: true }),

    // Dev Tools
    [ComponentNames.CHECKER]: Type.Boolean({ default: true }),
    [ComponentNames.PAIMA_PGLITE]: Type.Boolean({ default: false }),
    [ComponentNames.TMUX]: Type.Boolean({ default: true }),

    // DevOps
    [ComponentNames.COLLECTOR]: Type.Boolean({ default: true }),
    [ComponentNames.PAIMA_BATCHER]: Type.Boolean({ default: true }),
    [ComponentNames.DOCS]: Type.Boolean({ default: true }),
  }, { default: {} }),

  // Batcher options.
  // NOTE: Set processes[ComponentNames.PAIMA_BATCHER] = true to launch the batcher.
  batcher: Type.Optional(Type.Object({
    paimaL2Address: Type.String(),
    batcherPrivateKey: Type.String(),
    paimaSyncProtocolName: Type.String(),
    chainName: Type.String(),
    batchIntervalMs: Type.Number({ default: 1000 }),
  })),
});

type OrchestratorConfigType = Static<typeof OrchestratorConfig>;

export async function start(
  config: OrchestratorConfigType,
): Promise<void> {
  appConfig = config;
  pFactory = processFactory(config);
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
      Deno && Deno.env.set("PAIMA_LOGS_FORCE_STDOUT", "true");
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
      config.processes[ComponentNames.PAIMA_PGLITE] &&
      startProcess[ComponentNames.PAIMA_PGLITE],
      config.processes[ComponentNames.APPLY_MIGRATIONS] &&
      startProcess[ComponentNames.APPLY_MIGRATIONS],
    ]);

    // Al main system dependencies are launched.
    // Start user defined processes.
    const pipelines: (() => Promise<ProcessComponent>)[][] = [];
    for (const processList of config.processesToLaunch) {
      let first = true;
      const pipeline: (() => Promise<ProcessComponent>)[] = [];
      for (const process of processList.processes) {
        const { name, args, waitToExit, logs, type, link } = process;
        pipeline.push(async (): Promise<ProcessComponent> => {
          if (first && processList.stopProcessAtPort.length > 0) {
            await dkill({ ports: processList.stopProcessAtPort });
            first = false;
          }
          let logHandler_: typeof logHandler;
          switch (logs) {
            case "none":
              logHandler_ = () => {};
              break;
            case "otel-compatible":
              logHandler_ = logHandler;
              break;
            case "raw":
              logHandler_ = rawLogHandler;
              break;
          }
          const processComponent = $({
            args: args,
            component: name,
            log: logHandler_,
            abortController: type === "system-dependency"
              ? abortControllers.system
              : abortControllers.noncritical,
            link: link,
          });
          if (waitToExit) {
            await processComponent.process.status;
          }
          return processComponent;
        });
      }
      pipelines.push(pipeline);
    }
    // Now we transpose the pipelines, to make them run in parallel.
    const maxLength = Math.max(...pipelines.map((p) => p.length));
    for (let i = 0; i < maxLength; i++) {
      const batch: (false | (() => Promise<ProcessComponent>))[] = [];
      for (const pipeline of pipelines) {
        batch.push(pipeline[i] ? pipeline[i] : false);
      }
      processesToLaunch.push(batch);
    }

    processesToLaunch.push([
      config.processes[ComponentNames.PAIMA_BATCHER] &&
      startProcess[ComponentNames.PAIMA_BATCHER],
    ]);

    processesToLaunch.push([
      // Start the main process
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

export { appConfig, pFactory };

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
    await tm.readLaunchJson(config.packageName, session_name);

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
      args: ["task", "-f", config.packageName + "/explorer", "dev"],
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
      args: ["task", "-f", config.packageName + "/docs", "start"],
      component: ComponentNames.DOCS,
      abortController: abortControllers.developerUI,
    });
    void docs.process.status;
    return docs;
  },

  [ComponentNames.COLLECTOR]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.OTEL_COLLECTOR_PORT] });
    }

    const otlpCollector = $({
      args: [
        "run",
        "-A",
        "--unstable-temporal",
        config.packageName + "/collector/start",
      ],
      // collector always has to post logs directly to console
      // otherwise, it gets stuck in an infinite loop of sending to itself
      log: rawLogHandler,
      component: ComponentNames.COLLECTOR,
      abortController: abortControllers.noncritical,
    });
    void otlpCollector.process.status;

    await (new Deno.Command("wait-on", {
      args: [`tcp:${ENV.OTEL_COLLECTOR_PORT}`],
    })).spawn().status;

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

    if (!config.batcher) {
      throw new Error("Batcher config is required");
    }
    const { 
      paimaL2Address,
      batcherPrivateKey,
      chainName,
      paimaSyncProtocolName,
      batchIntervalMs,
    } = config.batcher;
    const batcher = $({
      args: [
        "run",
        "-A",
        config.packageName + "/batcher/start",
        `--batchIntervalMs=${batchIntervalMs ?? 1000}`,
        `--paimaL2Address=${paimaL2Address}`,
        `--batcherPrivateKey=${batcherPrivateKey}`,
        `--chainName=${chainName}`,
        `--paimaSyncProtocolName=${paimaSyncProtocolName}`,
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

  [ComponentNames.PAIMA_PGLITE]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.DB_PORT] });
    }

    const paimaDb = $({
      // TODO: run pgtyped:up only depending on parameters?
      args: [
        "run",
        "-A",
        config.packageName + "/db/start-pglite",
        "--port",
        String(ENV.DB_PORT),
      ],
      log: logHandler,
      component: ComponentNames.PAIMA_PGLITE,
      abortController: abortControllers.system,
    });
    void paimaDb.process.status; // need to await sub-service start below

    await (new Deno.Command("wait-on", {
      args: [`tcp:${ENV.DB_PORT}`],
    })).spawn().status;

    return paimaDb;
  },

  [ComponentNames.APPLY_MIGRATIONS]: async (): Promise<ProcessComponent> => {
    const externalPaimaDb = $({
      args: [
        "run",
        "-A",
        config.packageName + "/db/apply-migrations",
      ],
      component: ComponentNames.APPLY_MIGRATIONS,
      abortController: abortControllers.system,
    });
    await externalPaimaDb.process.status;
    return externalPaimaDb;
  },
});
