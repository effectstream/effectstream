import type { ProcessConfig } from "./config.ts";
import type { ProcessManager } from "./process-manager.ts";

export type RunOptions = {
  /**
   * If set, only these processes (plus all their transitive dependencies)
   * will be launched. All other configs are ignored.
   */
  only?: string[];
  /**
   * Names of processes to skip (even if they appear as dependencies of others).
   * Use with care—skipping a dependency may break its dependents.
   */
  except?: string[];
  /**
   * If true, processes are launched one at a time in dependency order
   * instead of in parallel waves. Useful when binaries conflict at the OS level.
   */
  serial?: boolean;
  /**
   * If true, --only launches only the named processes without pulling in
   * their transitive dependencies. Dependencies are assumed to be already running.
   */
  noDeps?: boolean;
  onTaskStart?: (name: string, logFile: string | null) => void;
  /** Called for background processes (waitToExit: false) once launched. */
  onTaskRunning?: (name: string) => void;
  onTaskDone?: (name: string) => void;
  onTaskFailed?: (name: string, code: number) => void;
  /** Called when the scheduler blocks until one or more waitToExit processes finish. */
  onWaitingForExit?: (names: string[]) => void;
  /** Called when a critical process fails and the whole run should stop. */
  onShutdown?: (reason: string) => void;
};

/**
 * Returns `configs` filtered to only include the named processes and all of
 * their transitive dependencies (preserving original order).
 */
export function resolveWithDependencies(
  all: ProcessConfig[],
  names: string[],
): ProcessConfig[] {
  const map = new Map(all.map((p) => [p.name, p]));
  const resolved = new Set<string>();

  function resolve(name: string, chain: string[] = []) {
    if (resolved.has(name)) return;
    if (chain.includes(name)) {
      throw new Error(
        `Circular dependency detected: ${[...chain, name].join(" → ")}`,
      );
    }
    const p = map.get(name);
    if (!p) throw new Error(`Process "${name}" not found in config`);
    for (const dep of p.dependsOn ?? []) {
      resolve(dep, [...chain, name]);
    }
    resolved.add(name);
  }

  for (const name of names) resolve(name);
  return all.filter((p) => resolved.has(p.name));
}

/**
 * Runs processes in dependency order using `manager`.
 *
 * - All processes whose dependencies are satisfied are launched IN PARALLEL
 *   as a "wave". This avoids slow sequential freePort/spawn calls blocking
 *   unrelated processes.
 * - Processes with `waitToExit: true` must exit (successfully) before their
 *   dependents can start.
 * - Processes with `waitToExit: false` (default) are considered "done" for
 *   dependency purposes as soon as they are launched.
 * - The function resolves once every process has been launched (and all
 *   `waitToExit` ones have finished).
 */
export async function runProcesses(
  allConfigs: ProcessConfig[],
  manager: ProcessManager,
  options: RunOptions = {},
): Promise<void> {
  // Apply filters
  let configs = allConfigs;

  if (options.only && options.only.length > 0) {
    if (options.noDeps) {
      const onlySet = new Set(options.only);
      configs = allConfigs.filter((p) => onlySet.has(p.name));
    } else {
      configs = resolveWithDependencies(allConfigs, options.only);
    }
  } else {
    // When no --only filter, exclude autoStart: false processes
    configs = configs.filter((p) => p.autoStart !== false);
  }

  if (options.except && options.except.length > 0) {
    const skip = new Set(options.except);
    configs = configs.filter((p) => !skip.has(p.name));
  }

  // Build task graph
  const configMap = new Map(configs.map((c) => [c.name, c]));

  // Pre-seed "done" with processes already managed (from earlier start calls).
  // A process that is currently running or has exited successfully counts as done
  // for dependency resolution, so new processes can depend on already-launched ones.
  const done = new Set<string>();
  for (const p of manager.getAll()) {
    if (p.status === "running" || p.status === "done") {
      done.add(p.name);
    }
  }

  // Validate that all declared dependencies are present in the run set or already done
  if (!options.noDeps) {
    for (const config of configs) {
      for (const dep of config.dependsOn ?? []) {
        if (!configMap.has(dep) && !done.has(dep)) {
          throw new Error(
            `Process "${config.name}" depends on "${dep}" which is not in the run set and not already running. ` +
              `If you used --only, you may need to include "${dep}" too, or start it first.`,
          );
        }
      }
    }
  }

  // In no-deps mode, treat all dependencies as already satisfied
  if (options.noDeps) {
    for (const config of configs) {
      for (const dep of config.dependsOn ?? []) {
        done.add(dep);
      }
    }
  }

  const waitingToExit = new Set<string>();
  const pending = new Set(configs.map((c) => c.name));

  // Don't re-launch processes that are already running
  for (const name of [...pending]) {
    if (manager.isRunning(name)) {
      pending.delete(name);
      done.add(name);
    }
  }

  // wakePending absorbs a wake() that fires before waitForWake() is called,
  // so the scheduler never gets stuck after a fast-exiting waitToExit process.
  let wakeResolve: (() => void) | null = null;
  let wakePending = false;
  const wake = () => {
    if (wakeResolve) {
      const r = wakeResolve;
      wakeResolve = null;
      r();
    } else {
      wakePending = true;
    }
  };
  const waitForWake = () => {
    if (wakePending) {
      wakePending = false;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      wakeResolve = resolve;
    });
  };

  let shutdownRequested = false;
  let lastWaitingForExitKey = "";

  while (pending.size > 0 || waitingToExit.size > 0) {
    if (shutdownRequested) break;

    // Collect every pending task whose dependencies are all satisfied
    let wave = [...pending].filter((name) => {
      const config = configMap.get(name)!;
      return (config.dependsOn ?? []).every((d) => done.has(d));
    });

    // In serial mode, launch only one process at a time
    if (options.serial && wave.length > 1) {
      wave = [wave[0]];
    }

    if (wave.length > 0) {
      // Remove from pending before any async work to prevent double-launch
      for (const name of wave) pending.delete(name);

      // Launch all tasks in this wave in parallel.
      // Each task is isolated in its own try/catch so one launch failure
      // does not prevent other tasks in the same wave from starting.
      await Promise.all(
        wave.map(async (name) => {
          if (shutdownRequested) return;

          const config = configMap.get(name)!;

          let waitForExit: Promise<number>;
          let logFile: string | null;
          try {
            ({ waitForExit, logFile } = await manager.launch(config));
          } catch (err: any) {
            options.onTaskFailed?.(name, -1);
            if (config.critical !== false) {
              shutdownRequested = true;
              options.onShutdown?.(`Failed to launch "${name}": ${err?.message ?? err}`);
              wake();
            }
            return;
          }

          // onTaskStart is called after launch so manager.get(name) is valid
          options.onTaskStart?.(name, logFile);

          if (config.waitToExit === true) {
            waitingToExit.add(name);

            waitForExit.then((code) => {
              waitingToExit.delete(name);

              if (code === 0) {
                done.add(name);
                options.onTaskDone?.(name);
              } else {
                options.onTaskFailed?.(name, code);

                if (config.critical !== false) {
                  shutdownRequested = true;
                  options.onShutdown?.(
                    `Process "${name}" exited with code ${code}`,
                  );
                } else {
                  done.add(name);
                }
              }

              wake();
            });
          } else {
            // Background — immediately "done" for dep resolution
            done.add(name);
            options.onTaskRunning?.(name);

            waitForExit.then((code) => {
              if (code !== 0 && config.critical !== false && !manager.isStopping(name)) {
                options.onTaskFailed?.(name, code);
                shutdownRequested = true;
                options.onShutdown?.(
                  `Background process "${name}" exited unexpectedly with code ${code}`,
                );
                wake();
              }
            });
          }
        }),
      );
    } else if (waitingToExit.size > 0) {
      // All ready tasks are launched; wait for a waitToExit one to finish
      const waitingKey = [...waitingToExit].sort().join("\0");
      if (waitingKey !== lastWaitingForExitKey) {
        lastWaitingForExitKey = waitingKey;
        options.onWaitingForExit?.([...waitingToExit].sort());
      }
      await waitForWake();
    } else {
      // pending > 0 but nothing is ready and nothing is waiting — circular dep
      const blocked = [...pending].map((n) => {
        const missing = (configMap.get(n)!.dependsOn ?? []).filter(
          (d) => !done.has(d),
        );
        return `  "${n}" is waiting for: ${missing.join(", ")}`;
      });
      throw new Error(
        `Circular dependency or unresolvable dependency detected:\n${blocked.join("\n")}`,
      );
    }
  }
}
