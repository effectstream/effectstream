#!/usr/bin/env -S deno run --allow-all
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
  AbortControllers,
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
    await Promise.all([
      $({
        args: ["task", "check"],
        log: logHandler,
      }).process.status,
    ]);

    // start the collector before any other process since it's the one that captures logs
    {
      // TODO: only start one if there isn't one already running
      const otlpCollector = $({
        args: ["task", "-f", "@paima/collector", "start"],
        signal: AbortControllers.otel,
        // collector always has to post logs directly to console
        // otherwise, it gets stuck in an infinite loop of sending to itself
        log: rawLogHandler,
        component: ComponentNames.COLLECTOR,
      });
      void Promise.all([otlpCollector.process.status]);

      const waitOtlp = $({
        args: ["task", "-f", "@paima/collector", "wait"],
        signal: AbortControllers.otel,
        // collector always has to post logs directly to console
        // otherwise, it gets stuck in an infinite loop of sending to itself
        log: rawLogHandler,
        component: ComponentNames.COLLECTOR,
      });
      await Promise.all([waitOtlp.process.status]);
      setCollectorStarted();
    }
    // Do now wait for the TUI process to finish,
    // as it's a long-running process.
    startTUI();

    await Promise.all([
      startDb(),
      startCardano(),
      startEvm(),
    ]);

    await $({
      args: ["task", "node:start"],
      signal: AbortControllers.node,
      log: logHandler,
      component: ComponentNames.PAIMA_SYNC,
      namespace: [], // these should get a "paima" namespace added to them automatically
    }).process.status;
  } catch (e) {
    if (!(e instanceof AbortProcessStart)) {
      console.error(e);
    }
    await awaitShutdown();
    Deno.exit(1);
  }
}

async function startTUI(): Promise<ProcessComponent> {
  const tui = $({
    args: ["task", "-f", "@paima/tui", "dev"],
    signal: AbortControllers.node,
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
}

async function startEvm(): Promise<ProcessComponent> {
  // TODO: some way to specify which chains should be used for a project
  const hardhat = $({
    args: ["task", "-f", "@example/evm-contracts", "chain:start"],
    signal: AbortControllers.chain,
    log: logHandler,
    component: ComponentNames.HARDHAT,
  });
  void hardhat.process.status; // need to await sub-service start below

  await $({
    args: ["task", "-f", "@example/evm-contracts", "chain:wait"],
  }).process.status;

  return hardhat;
}

async function startCardano(): Promise<[ProcessComponent, ProcessComponent]> {
  const yaciDevkit = $({
    args: ["task", "-f", "@example/cardano-contracts", "devkit:start"],
    signal: AbortControllers.node,
    log: logHandler,
    component: ComponentNames.YACI_DEVKIT,
  });
  void yaciDevkit.process.status; // need to await sub-service start below

  await $({
    args: ["task", "-f", "@example/cardano-contracts", "devkit:wait"],
  })
    .process.status;

  const dolos = $({
    args: ["task", "-f", "@example/cardano-contracts", "dolos:start"],
    signal: AbortControllers.chain,
    // use this until Dolos supports otel: https://github.com/txpipe/dolos/issues/399
    log: (chunk) =>
      rawLogHandler(chunk, "stdout", ComponentNames.DOLOS, "dolos"),
    component: ComponentNames.DOLOS,
  });
  void dolos.process.status; // need to await sub-service start below

  await $({
    args: ["task", "-f", "@example/cardano-contracts", "dolos:wait"],
  })
    .process.status;

  return [yaciDevkit, dolos];
}

async function startDb(): Promise<ProcessComponent> {
  const paimaDb = $({
    // TODO: run pgtyped:up only depending on parameters?
    args: ["task", "-f", "@paima/db", "pgtyped:update"],
    signal: AbortControllers.db,
    log: logHandler,
    component: ComponentNames.PAIMA_DB,
  });
  void paimaDb.process.status; // need to await sub-service start below

  await $({
    args: ["task", "-f", "@paima/db", "db:wait"],
  }).process.status;

  return paimaDb;
}
