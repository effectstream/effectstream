#!/usr/bin/env -S deno run --allow-all
import { ENV } from "@effectstream/utils/node-env";
import type { ValueOf } from "@effectstream/utils";
import "./http-server.ts";
import { dkill } from "@sylc/dkill";

import {
  initTelemetry,
  logHandler,
  rawLogHandler,
  setCollectorStarted,
  setCurrentOutput,
  noLogsHandler,
} from "./logging.ts";
import {
  $,
  AbortProcessStart,
  type ProcessComponent,
  setForegroundProcess,
  shutdown,
} from "./process.ts";
import { ComponentNames } from "@effectstream/log";
import { Tmux } from "./tmux/tmux.ts";
import type { LaunchableComponents } from "@effectstream/log";
import { type Static, Type } from "@sinclair/typebox";

let appConfig: OrchestratorConfigType | null = null;
let pFactory: ReturnType<typeof processFactory> | null = null;

const ProcessLaunch = Type.Object({
  name: Type.String(),
  description: Type.String({ default: '' }),
  stopProcessAtPort: Type.Array(Type.Number(), { default: [] }),
  dependsOn: Type.Array(Type.String(), { default: [] }),
  args: Type.Array(Type.String()),
  waitToExit: Type.Boolean({ default: true }),
  link: Type.String({ default: '' }),
  logs: Type.Union(
    [Type.Literal('otel-compatible'), Type.Literal('raw'), Type.Literal('none')],
    { default: 'raw' }
  ),
  type: Type.Union(
    [Type.Literal('system-dependency'), Type.Literal('secondary')],
    { default: 'secondary' }
  ),
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
    //       And other ports are checked.
    auto: Type.Boolean({ default: true }),
  }, { default: {} }),

  // Custom user defined processes to launch.
  // For example you can launch hardhat evm chains, wait to be ready and deploy contracts.
  processesToLaunch: Type.Array(ProcessLaunch, { default: [] }),

  // This can be customized for different locations of the packages.
  // nightly: jsr:@paimaexample
  // release: jsr:@paima
  // local development: @paima
  packageName: Type.String({ default: "jsr:@effectstream" }),
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
    [ComponentNames.LOKI]: Type.Boolean({ default: true }),
  }, { default: {} }),
});

type OrchestratorConfigType = Static<typeof OrchestratorConfig>;

type Task = {
  name: string;
  config: Static<typeof ProcessLaunch> | SystemProcess;
  dependencies: Set<string>;
  dependents: Set<string>;
  status: 'pending' | 'running' | 'finished' | 'failed';
  process?: ProcessComponent;
};

type SystemProcess = {
  name: string;
  dependsOn: string[];
  launch: () => Promise<ProcessComponent>;
};

const setupLogging = (config: OrchestratorConfigType): void => {
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
}

export async function start(
  config: OrchestratorConfigType,
): Promise<void> {
  appConfig = config;
  pFactory = processFactory(config);
  setupLogging(config);
  try {

    const tasks = new Map<string, Task>();
    const processesToRun: (Static<typeof ProcessLaunch> | SystemProcess)[] = [...config.processesToLaunch];

    // Build task graph
    for (const processConfig of processesToRun) {
      if (tasks.has(processConfig.name)) {
        console.error(`Error: Duplicate process name "${processConfig.name}" found. Process names must be unique.`);
        await shutdown(1);
        return;
      }
      tasks.set(processConfig.name, {
        name: processConfig.name,
        config: processConfig,
        dependencies: new Set(processConfig.dependsOn),
        dependents: new Set(),
        status: 'pending',
      });
    }

    for (const task of tasks.values()) {
      for (const depName of task.dependencies) {
        const depTask = tasks.get(depName);
        if (depTask) {
          depTask.dependents.add(task.name);
        } else {
          console.error(`Error: Dependency "${depName}" for process "${task.name}" not found.`);
          await shutdown(1);
          return;
        }
      }
    }

    // Start System Processes
    const startProcess = processFactory(config);

    // Add system processes
    if (config.processes[ComponentNames.CHECKER]) {
      await startProcess[ComponentNames.CHECKER]();
    }
    if (config.processes[ComponentNames.TMUX]) {
      await startProcess[ComponentNames.TMUX]();
    }
    if (config.processes[ComponentNames.COLLECTOR]) {
      await startProcess[ComponentNames.COLLECTOR]();
    }
    if (config.processes[ComponentNames.PAIMA_PGLITE]) {
      await startProcess[ComponentNames.PAIMA_PGLITE]();
    }
    if (config.processes[ComponentNames.APPLY_MIGRATIONS]) {
      await startProcess[ComponentNames.APPLY_MIGRATIONS]();
    }
    if (config.processes[ComponentNames.LOKI]) {
      await startProcess[ComponentNames.LOKI]();
    }


    // Start User-defined Processes
    const pending = new Set<string>(tasks.keys());
    const runningWaitToFinish = new Map<string, Promise<void>>();
    const runningProcesses = new Map<string, Promise<void>>();
    const finished = new Set<string>();

    let circularDependencyLoopCount = 0;
    const CIRCULAR_DEPENDENCY_THRESHOLD = 50;
    let lastPendingSnapshot: Set<string> | null = null;
    
    const launchTask = async (task: Task): Promise<void> => {
      task.status = 'running';

      let processComponent: ProcessComponent;
      if ('launch' in task.config) { // System process
        processComponent = await task.config.launch();
      } else { // User-defined process
        const { name, args, logs, type, link, stopProcessAtPort } = task.config;
        if (stopProcessAtPort.length > 0) {
          await dkill({ ports: stopProcessAtPort });
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
        processComponent = $({
          args: args,
          component: name,
          log: logHandler_,
          abortController: type === "system-dependency"
            ? abortControllers.system
            : abortControllers.noncritical,
          link: link,
        });
      }
      task.process = processComponent;

      const finish = (): void => {
        task.status = 'finished';
        finished.add(task.name);
        runningWaitToFinish.delete(task.name);
        runningProcesses.delete(task.name);

        for (const dependentName of task.dependents) {
          const dependentTask = tasks.get(dependentName)!;
          dependentTask.dependencies.delete(task.name);
        }
        // Wake up the main loop
        if (waiter) {
          waiter();
          waiter = null;
        }
      };
      
      const waitToExit = 'waitToExit' in task.config ? task.config.waitToExit : true;

      if (waitToExit) {
        task.process.process.status.then(finish).catch(async err => {
            console.error(`Task ${task.name} failed with error: ${err}`);
            task.status = 'failed';
            await shutdown(1, err);
        });
      } else {
        finish();
      }
    };

    let waiter: (() => void) | null = null;
    
    while (pending.size > 0 || runningWaitToFinish.size > 0) {
        const executableTasks = Array.from(pending)
            .map(name => tasks.get(name)!)
            .filter(task => task.dependencies.size === 0);

        if (executableTasks.length > 0) {
            for (const task of executableTasks) {
                pending.delete(task.name);
                const taskPromise = launchTask(task);
                const waitToExit = 'waitToExit' in task.config ? task.config.waitToExit : true;
                if (waitToExit) {
                  runningWaitToFinish.set(task.name, taskPromise);
                } else {
                  runningProcesses.set(task.name, taskPromise);
                }
            }
        } else if (runningWaitToFinish.size > 0) {
            for (const pendingTaskName of pending) {
                const pendingTask = tasks.get(pendingTaskName)!;
            }
            await new Promise<void>(resolve => {
                waiter = resolve;
            });
        } else if (pending.size > 0) {
            // Check if we have the same pending tasks as last iteration
            const currentPendingSnapshot = new Set(pending);
            const isSamePending = lastPendingSnapshot && 
                currentPendingSnapshot.size === lastPendingSnapshot.size &&
                [...currentPendingSnapshot].every(task => lastPendingSnapshot!.has(task));
            
            if (isSamePending) {
                circularDependencyLoopCount++;
            } else {
                circularDependencyLoopCount = 0;
            }
            
            lastPendingSnapshot = currentPendingSnapshot;
            
            if (circularDependencyLoopCount >= CIRCULAR_DEPENDENCY_THRESHOLD) {
                console.error('Error: Circular dependency or missing dependency detected.');
                console.error('Pending tasks:');
                for (const pendingTaskName of pending) {
                    const pendingTask = tasks.get(pendingTaskName)!;
                    console.error(`  - ${pendingTask.name} is waiting for: ${[...pendingTask.dependencies].join(', ')}`);
                }
                await shutdown(1);
                return;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for all processes to finish
    // Launch Paima Engine Main Sync Process
    await startProcess[ComponentNames.PAIMA_SYNC]();

    
  } catch (e) {
    if (!(e instanceof AbortProcessStart)) {
      await shutdown(1, e);
    }
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

    await Tmux.install();
    const tmux = new Tmux();
    await tmux.startSession();
    const tmuxConsole = $({
      ...tmux.getAttachCommand(),
      component: ComponentNames.TMUX,
      abortController: abortControllers.developerUI,
    });
    tmuxConsole.process.status.then(() => {
      tmux.killServer();
    });
    setForegroundProcess(tmuxConsole.process);
    return tmuxConsole;
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

  [ComponentNames.COLLECTOR]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.OTEL_COLLECTOR_PORT, 12345] }); // 12345 is the port for the Grafana Alloy web UI
    }

    // deno -A @effectstream/grafana-alloy grafana-alloy
    const otlpCollector = $({
      args: ["-A", "@effectstream/grafana-alloy", "grafana-alloy"],
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

  [ComponentNames.LOKI]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [3100] });
    }
    const loki = $({
      args: ["-A", "@effectstream/grafana-loki", "grafana-loki"],
      component: ComponentNames.LOKI,
      log: noLogsHandler,
      abortController: abortControllers.noncritical,
    });
  
    void loki.process.status;
    return loki;
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
