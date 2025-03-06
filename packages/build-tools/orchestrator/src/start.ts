#!/usr/bin/env -S deno run --allow-all

import {
  initTelemetry,
  logHandler,
  rawLogHandler,
  setCollectorStarted,
} from "./logging.ts";
import { $, AbortControllers } from "./process.ts";
import { ComponentNames } from "@paima/log";

export async function start(): Promise<void> {
  initTelemetry();

  try {
    // fast-fail if there are type errors in the project
    await Promise.all([
      $({
        args: ["task", "check"],
        signal: AbortControllers.chain,
        log: logHandler,
      }).status,
    ]);

    // start the collector before any other process since it's the one that captures logs
    {
      // TODO: only start one if there isn't one already running
      const otlpCollector = $({
        args: ["task", "-f", "@paima/collector", "start"],
        signal: AbortControllers.chain,
        // collector always has to post logs directly to console
        // otherwise, it gets stuck in an infinite loop of sending to itself
        log: rawLogHandler,
        component: ComponentNames.COLLECTOR,
      });
      void Promise.all([otlpCollector.status]);
      const waitOtlp = $({
        args: ["task", "-f", "@paima/collector", "wait"],
        signal: AbortControllers.chain,
        // collector always has to post logs directly to console
        // otherwise, it gets stuck in an infinite loop of sending to itself
        log: rawLogHandler,
        component: ComponentNames.COLLECTOR,
      });
      await Promise.all([waitOtlp.status]);
      setCollectorStarted();
    }

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
    }).status;
  } catch (e) {
    console.error(e);
  }
}

async function startEvm(): Promise<Deno.CommandStatus> {
  // TODO: some way to specify which chains should be used for a project
  const hardhat = $({
    args: ["task", "-f", "@example/evm-contracts", "chain:start"],
    signal: AbortControllers.chain,
    log: logHandler,
    component: ComponentNames.HARDHAT,
  });
  void hardhat.status; // need to await sub-service start below

  return await $({
    args: ["task", "-f", "@example/evm-contracts", "chain:wait"],
  })
    .status;
}

async function startCardano(): Promise<Deno.CommandStatus> {
  const yaciDevkit = $({
    args: ["task", "-f", "@example/cardano-contracts", "devkit:start"],
    signal: AbortControllers.chain,
    log: logHandler,
    component: ComponentNames.YACI_DEVKIT,
  });
  void yaciDevkit.status; // need to await sub-service start below

  await $({
    args: ["task", "-f", "@example/cardano-contracts", "devkit:wait"],
  })
    .status;

  const dolos = $({
    args: ["task", "-f", "@example/cardano-contracts", "dolos:start"],
    signal: AbortControllers.chain,
    // use this until Dolos supports otel: https://github.com/txpipe/dolos/issues/399
    log: rawLogHandler,
    component: ComponentNames.DOLOS,
  });
  void dolos.status; // need to await sub-service start below

  return await $({
    args: ["task", "-f", "@example/cardano-contracts", "dolos:wait"],
  })
    .status;
}

async function startDb(): Promise<Deno.CommandStatus> {
  const paimaDb = $({
    args: ["task", "-f", "@paima/db", "db:up"],
    signal: AbortControllers.db,
    log: logHandler,
    component: ComponentNames.PAIMA_DB,
  });
  void paimaDb.status; // need to await sub-service start below

  return await $({
    args: ["task", "-f", "@paima/db", "db:wait"],
  }).status;
}
