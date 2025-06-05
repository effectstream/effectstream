#!/usr/bin/env -S deno run --allow-all
import { ValueOf } from "@paima/utils";
import "./http-server.ts";

import {
  getCurrentOutput,
  initTelemetry,
  logHandler,
  rawLogHandler,
  setCollectorStarted,
} from "./logging.ts";
import {
  $,
  AbortProcessStart,
  type ProcessComponent,
  processes,
} from "./process.ts";
import { ComponentNames } from "@paima/log";

export async function awaitShutdown(): Promise<void> {
  await Promise.all(
    processes.map((process) => process.process[Symbol.asyncDispose]()),
  );
}

export async function start(): Promise<void> {
  initTelemetry();

  try {
    // fast-fail if there are type errors in the project
    await startProcess[ComponentNames.CHECKER]();

    // start the collector before any other process since it's the one that captures logs
    await startProcess[ComponentNames.COLLECTOR]();

    // Do now wait for the TUI process to finish as it's a long-running process.
    startProcess[ComponentNames.TUI]();

    // Start processes in parallel
    await Promise.all([
      startProcess[ComponentNames.PAIMA_DB](),
      startProcess[ComponentNames.YACI_DEVKIT](),
      startProcess[ComponentNames.HARDHAT](),
    ]);

    // Start the Dolos process
    await startProcess[ComponentNames.DOLOS]();

    // Start the main process
    await startProcess[ComponentNames.PAIMA_SYNC]();
  } catch (e) {
    if (!(e instanceof AbortProcessStart)) {
      console.error(e);
    }
    await awaitShutdown();
    Deno.exit(1);
  }
}

export const startProcess: Record<
  ValueOf<typeof ComponentNames>,
  () => Promise<ProcessComponent>
> = {
  [ComponentNames.COLLECTOR]: async (): Promise<ProcessComponent> => {
    // TODO: only start one if there isn't one already running
    const otlpCollector = $({
      args: ["task", "-f", "@paima/collector", "start"],
      // collector always has to post logs directly to console
      // otherwise, it gets stuck in an infinite loop of sending to itself
      log: rawLogHandler,
      component: ComponentNames.COLLECTOR,
    });
    void Promise.all([otlpCollector.process.status]);

    const waitOtlp = $({
      args: ["task", "-f", "@paima/collector", "wait"],
      // collector always has to post logs directly to console
      // otherwise, it gets stuck in an infinite loop of sending to itself
      log: rawLogHandler,
      component: ComponentNames.COLLECTOR_WAIT,
    });
    await Promise.all([waitOtlp.process.status]);
    setCollectorStarted();
    return otlpCollector;
  },

  [ComponentNames.CHECKER]: async (): Promise<ProcessComponent> => {
    const checker = $({
      args: ["task", "check"],
      log: logHandler,
      component: ComponentNames.CHECKER,
    });
    await Promise.all([checker.process.status]);
    return checker;
  },

  [ComponentNames.PAIMA_SYNC]: async (): Promise<ProcessComponent> => {
    const node = $({
      args: ["task", "node:start"],
      log: logHandler,
      component: ComponentNames.PAIMA_SYNC,
      namespace: [], // these should get a "paima" namespace added to them automatically
    });
    await Promise.all([node.process.status]);
    return node;
  },

  [ComponentNames.TUI]: async (): Promise<ProcessComponent> => {
    const tui = $({
      args: ["task", "-f", "@paima/tui", "dev"],
      log: (
        chunk: Uint8Array,
      ) => {
        if (getCurrentOutput() === "tui") {
          Deno.stdout.write(chunk);
        }
      },
      component: ComponentNames.TUI,
    });
    await Promise.all([tui.process.status]);
    return tui;
  },

  [ComponentNames.HARDHAT]: async (): Promise<ProcessComponent> => {
    // TODO: some way to specify which chains should be used for a project
    const hardhat = $({
      args: ["task", "-f", "@example/evm-contracts", "chain:start"],
      log: logHandler,
      component: ComponentNames.HARDHAT,
    });
    void hardhat.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@example/evm-contracts", "chain:wait"],
      component: ComponentNames.HARDHA_WAIT,
    }).process.status;

    return hardhat;
  },

  [ComponentNames.YACI_DEVKIT]: async (): Promise<ProcessComponent> => {
    const yaciDevkit = $({
      args: ["task", "-f", "@example/cardano-contracts", "devkit:start"],
      log: logHandler,
      component: ComponentNames.YACI_DEVKIT,
    });
    void yaciDevkit.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@example/cardano-contracts", "devkit:wait"],
      component: ComponentNames.YACI_DEVKIT_WAIT,
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
    });
    void dolos.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@example/cardano-contracts", "dolos:wait"],
      component: ComponentNames.DOLOS_WAIT,
    })
      .process.status;

    return dolos;
  },

  [ComponentNames.PAIMA_DB]: async (): Promise<ProcessComponent> => {
    const paimaDb = $({
      // TODO: run pgtyped:up only depending on parameters?
      args: ["task", "-f", "@paima/db", "pgtyped:update"],
      log: logHandler,
      component: ComponentNames.PAIMA_DB,
    });
    void paimaDb.process.status; // need to await sub-service start below

    await $({
      args: ["task", "-f", "@paima/db", "db:wait"],
      component: ComponentNames.PAIMA_DB_WAIT,
    }).process.status;

    return paimaDb;
  },
};
