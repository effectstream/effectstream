#!/usr/bin/env -S deno run --allow-all
import type { ValueOf } from "@paima/utils";
import "./http-server.ts";
import { dkill } from "@sylc/dkill";
import { contractAddressesEvmMain } from "@example/evm-contracts";

import {
  getCurrentOutput,
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

Deno.addSignalListener("SIGINT", () => {
  shutdown(0);
});

function getOptions(config: {
  output?: "none" | "stdout-err" | "stdout" | "development" | "production";
}) {
  const output = config.output ?? "development";
  const enableTUI = output === "development";
  const enableCollector = output === "development";
  switch (output) {
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
      break;
    case "production":
      setCurrentOutput(["otel", "stdout"]);
      break;
  }
  return {
    enableTUI,
    enableCollector,
  };
}

/*  Config options:
 *
 *  | config.output | Terminal     | OTEL   | Collector | TUI    |
 *  |---------------|--------------|--------|-----------|--------|
 *  | development   | no           | yes    | yes       | yes    |
 *  | production    | yes          | yes    | no        | no     |
 *  | stdout        | yes          | no     | no        | no     |
 *  | stdout-err    | yes (errors) | no     | no        | no     |
 *  | none          | no           | no     | no        | no     |
 */
export async function start(
  config: {
    output?: "development" | "production" | "stdout" | "stdout-err" | "none";
  } = {},
): Promise<void> {
  // TODO This is a workaround to kill any processes that are still running from a previous run.
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
  await dkill({ ports: [8090, 10000, 5432, 8545, 3334] });

  // fast-fail if there are type errors in the project
  await startProcess[ComponentNames.CHECKER]();

  const { enableTUI, enableCollector } = getOptions(config);

  if (enableTUI) {
    await startProcess[ComponentNames.TMUX]();
  }
  try {
    if (getCurrentOutput().includes("otel")) {
      initTelemetry();
    }
    // start the collector before any other process since it's the one that captures logs
    if (enableCollector) {
      await startProcess[ComponentNames.COLLECTOR]();
    }

    // Start processes in parallel
    await Promise.all([
      startProcess[ComponentNames.DOCS](),
      startProcess[ComponentNames.PAIMA_DB](),
      startProcess[ComponentNames.YACI_DEVKIT](),
      startProcess[ComponentNames.HARDHAT](),
    ]);

    await Promise.all([
      // Start the Dolos process. Depends on YaciDevkit.
      startProcess[ComponentNames.DOLOS](),
      // Deploy the contracts. Depends on Hardhat.
      startProcess[ComponentNames.DEPLOY_EVM_CONTRACTS](),
    ]);

    // Start the batcher, after the contracts are deployed.
    await startProcess[ComponentNames.PAIMA_BATCHER]();

    // Start the explorer
    // This crashes when launching process through Deno.command
    // await startProcess[ComponentNames.EXPLORER]();

    // Start the main process
    await startProcess[ComponentNames.PAIMA_SYNC]();
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

export const startProcess: Record<
  ValueOf<typeof ComponentNames>,
  () => Promise<ProcessComponent>
> = {
  [ComponentNames.TMUX]: async (): Promise<ProcessComponent> => {
    await installTmux();
    const session_name = "paima-" + Date.now();

    const tm = new Tmux({});
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
    // TODO: only start one if there isn't one already running
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
    // TODO This should be read from the config.
    const paimaL2Address = contractAddressesEvmMain()["chain31337"][
      "PaimaL2ContractModule#MyPaimaL2Contract"
    ];
    const batcherPrivateKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const chainName = "hardhat";
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

  [ComponentNames.TUI]: async (): Promise<ProcessComponent> => {
    const tui = $({
      args: ["task", "-f", "@paima/tui", "dev"],
      log: (chunk: Uint8Array) => {
        // The TUI writes directly to stdout.
        Deno.stdout.write(chunk);
      },
      component: ComponentNames.TUI,
      abortController: abortControllers.noncritical,
    });
    await Promise.all([tui.process.status]);
    return tui;
  },

  [ComponentNames.HARDHAT]: async (): Promise<ProcessComponent> => {
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
};
