#!/usr/bin/env -S deno run --allow-all
import { ENV } from "@effectstream/utils/node-env";
import type { ValueOf } from "@effectstream/utils";
import "./http-server.ts";
import { dkill } from "@sylc/dkill";

import {
  initTelemetry,
  logHandler,
  setCollectorStarted,
  setTUIStarted,
  setStdoutOutput,
  setStderrOutput,
  tsLogOrchestratorAdapter,
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

const LOG_DISPLAY_CONTROL_URL =
  `${ENV.TUI_LOG_URL}:${ENV.TUI_LOG_PORT}/v1/display-control`;

const setInitialLogDisplayDisabled = async (
  processName: string,
): Promise<void> => {
  const maxAttempts = 5;
  const delayMs = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(LOG_DISPLAY_CONTROL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processName, enabled: false }),
      });
      if (response.ok) return;
    } catch (_error) {
      // best-effort retry below
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(
    `Failed to set initial log display disabled for ${processName} after ${maxAttempts} attempts`,
  );
};

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
  logsStartDisabled: Type.Boolean({ default: false }),
  disableStderr: Type.Boolean({ default: false }),
  critical: Type.Boolean({ default: true }),
  logs: Type.Union(
    [Type.Literal('tsLogOrchestratorAdapter'), Type.Literal('raw'), Type.Literal('none')],
    { default: 'raw' }
  ),
  type: Type.Union(
    [Type.Literal('system-dependency'), Type.Literal('secondary')],
    { default: 'secondary' }
  ),
  // If not provided, the default command is "deno"
  command: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
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
    
    // Send to TUI and OTEL collector 
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
  processesToLaunch: Type.Array(Type.Union([ProcessLaunch, Type.Boolean()]), { default: [] }),

  // This can be customized for different locations of the packages.
  // nightly: jsr:@paimaexample
  // release: jsr:@paima
  // local development: @paima
  packageName: Type.String({ default: "jsr:@effectstream" }),
  packageVersion: Type.String({ default: "" }),

  // Processes to start
  processes: Type.Object({
    // Main Processes
    [ComponentNames.EFFECTSTREAM_SYNC]: Type.Boolean({ default: true }),

    // Dev Tools
    [ComponentNames.CHECKER]: Type.Boolean({ default: true }),
    [ComponentNames.EFFECTSTREAM_PGLITE]: Type.Boolean({ default: false }),
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
  // Let's setup the output mode for logs.
  switch (config.logs) {
    case "none": break;

    case "stdout-err":
      setStderrOutput();
      break;
  
    case "stdout":
      setStdoutOutput();
      setStderrOutput();
      break;
   
    case "development":
      setTUIStarted(ENV.TUI_LOG_PORT);
      initTelemetry();
      break;

    case "production":
      setStdoutOutput();
      setStderrOutput();
      initTelemetry();
      break;
  }
}

export async function start(
  config: OrchestratorConfigType,
): Promise<void> {
  // This is to redirect all logs.remote to the orchestrator, 
  // where they will be redirected to the collector.
  Deno.env.set("EFFECTSTREAM_ORCHESTRATOR", "true");
  appConfig = config;
  pFactory = processFactory(config);
  setupLogging(config);
  try {

    const tasks = new Map<string, Task>();
    const processesToRun: (Static<typeof ProcessLaunch> | SystemProcess)[] = [...config.processesToLaunch.filter(p => typeof p !== 'boolean')];

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
    if (config.processes[ComponentNames.LOKI]) {
      await startProcess[ComponentNames.LOKI]();
    }
    if (config.processes[ComponentNames.CHECKER]) {
      await startProcess[ComponentNames.CHECKER]();
    }
    if (config.processes[ComponentNames.TMUX]) {
      await startProcess[ComponentNames.TMUX]();
    }
    if (config.processes[ComponentNames.COLLECTOR]) {
      await startProcess[ComponentNames.COLLECTOR]();
    }
    if (config.processes[ComponentNames.EFFECTSTREAM_PGLITE]) {
      await startProcess[ComponentNames.EFFECTSTREAM_PGLITE]();
    }
    if (config.processes[ComponentNames.APPLY_MIGRATIONS]) {
      await startProcess[ComponentNames.APPLY_MIGRATIONS]();
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
        const {
          name,
          args,
          logs,
          type,
          link,
          disableStderr,
          stopProcessAtPort,
          logsStartDisabled,
          critical,
          command,
          cwd,
        } = task.config
        if (stopProcessAtPort.length > 0) {
          await dkill({ ports: stopProcessAtPort });
        }

        // Prime the TUI log display state for this process and optionally
        // stop forwarding logs to the TUI entirely when starting disabled.
        if (logsStartDisabled) {
          void setInitialLogDisplayDisabled(name);
        }

        try {
          processComponent = $({
            command,
            args,
            component: name,
            cwd,
            log: logs === 'none' ? undefined : logHandler(
              { disableStderr: disableStderr ?? false },
              logs === 'tsLogOrchestratorAdapter'
                ? tsLogOrchestratorAdapter
                : undefined,
            ),
            abortController: type === "system-dependency"
              ? abortControllers.system
              : abortControllers.noncritical,
            link: link,
            critical: critical,
            stdin: logs === 'none' ? 'null' : undefined,
            stdout: logs === 'none' ? 'null' : undefined,
            stderr: logs === 'none' ? 'null' : undefined,
          });
        } catch (e) {
          if (e instanceof AbortProcessStart) {
            // We stopped all processes, a waiting process is trying to start - as the dependency finished.
            return;
          }
          // Unknown error, throw error to be handled by the main loop.
          throw e;
        }
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
    await startProcess[ComponentNames.EFFECTSTREAM_SYNC]();

    
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
      critical: true,
      // log, this process must no be redirected to the collector
      // this writes directly to the stdout
    });
    tmuxConsole.process.status.then(() => {
      tmux.killServer();
    });
    setForegroundProcess(tmuxConsole.process);
    return tmuxConsole;
  },

  [ComponentNames.EXPLORER]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.EFFECTSTREAM_EXPLORER_PORT] });
    }
    const explorer = $({
      args: ["task", "-f", config.packageName + "/explorer", "dev"],
      component: ComponentNames.EXPLORER,
      log: logHandler(),
      abortController: abortControllers.developerUI,
      critical: false,
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
      log: logHandler({
        disableCollector: true,
        disableTUI: true,
        disableStdOut: true,
        disableStderr: true,
      }),
      component: ComponentNames.COLLECTOR,
      abortController: abortControllers.noncritical,
      critical: false,
    });
    void otlpCollector.process.status;

    await (new Deno.Command("wait-on", {
      args: [`tcp:${ENV.OTEL_COLLECTOR_PORT}`],
    })).spawn().status;

    setCollectorStarted(ENV.OTEL_COLLECTOR_PORT);
    return otlpCollector;
  },

  [ComponentNames.LOKI]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [3100] });
    }
    const loki = $({
      args: ["-A", "@effectstream/grafana-loki", "grafana-loki"],
      component: ComponentNames.LOKI,
      log: logHandler(
      {
        disableCollector: true,
        disableTUI: true,
        disableStdOut: true,
        disableStderr: true,
      }
    ),
      abortController: abortControllers.noncritical,
      critical: false,
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
      critical: true,
    });
    await Promise.all([checker.process.status]);
    return checker;
  },

  [ComponentNames.EFFECTSTREAM_SYNC]: async (): Promise<ProcessComponent> => {
    if (config.kill.auto) {
      await dkill({ ports: [ENV.EFFECTSTREAM_API_PORT] });
    }

    const node = $({
      args: ["task", "node:start"],
      log: logHandler({}, tsLogOrchestratorAdapter),
      component: ComponentNames.EFFECTSTREAM_SYNC,
      namespace: [], // these should get a "paima" namespace added to them automatically
      abortController: abortControllers.system,
      // Allow sync to fail without killing the orchestrator; TUI/R restart can recover it.
      critical: false,
    });
    await Promise.all([node.process.status]);
    return node;
  },

  [ComponentNames.EFFECTSTREAM_PGLITE]: async (): Promise<ProcessComponent> => {
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
      log: logHandler(),
      component: ComponentNames.EFFECTSTREAM_PGLITE,
      abortController: abortControllers.system,
      critical: true,
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
      log: logHandler({}, tsLogOrchestratorAdapter),
      abortController: abortControllers.system,
      critical: true,
    });
    await externalPaimaDb.process.status;
    return externalPaimaDb;
  },
});
