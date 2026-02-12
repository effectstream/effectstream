import { type LogHandler, streamTo, systemLog } from "./logging.ts";
import type { Namespace } from "@effectstream/log";
import { ComponentNames } from "@effectstream/log";
import type { ValueOf } from "@effectstream/utils";
import type { SpawnChild } from "@effectstream/utils/runtime";
import { spawn } from "@effectstream/utils/runtime";
import { abortControllers } from "./start.ts";

export type ProcessComponent = {
  abortController: AbortController;
  process: SpawnChild;
  is_piped: { stderr: boolean; stdout: boolean };
  component: ValueOf<typeof ComponentNames>;
  args: string[];
  alive: boolean;
  date: string;
  link: string;
  critical: boolean;
  // This is internal temporal flag to notify that the next
  // "restart" is intended, so we do not stop effectstream-engine.
  _allow_restart?: boolean;
};

export class AbortProcessStart extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortProcessStart";
  }
}

let foregroundProcess: SpawnChild | null = null;
export function setForegroundProcess(proc: SpawnChild) {
  foregroundProcess = proc;
}

let shutdownCalled = false;
export async function shutdown(
  exitCode: number = 0,
  reason?: any,
): Promise<void> {
  if (shutdownCalled) {
    return;
  }
  shutdownCalled = true;

  // Shut down non-UI processes.
  abortControllers.system.abort();
  abortControllers.noncritical.abort();
  // Start force-killing stragglers.
  const forced = awaitShutdown();

  // Wait for the foreground process to finish so we have control of the terminal.
  if (foregroundProcess) {
    await foregroundProcess.status;
  }
  // We now have control of the terminal again, so start printing stuff...
  if (reason) {
    console.trace(reason);
  }
  // Print force-kill logs.
  for (const p of await forced) {
    console.log("Force killed process", p.process.pid, ":", p.args);
  }

  // This process is actually being kept alive by the HTTP server which isn't stopped here.
  // If we exit naively, some child processes will orphan themselves and stay running, such as
  // `yaci-dev` which doesn't propagate kills down to the actual Cardano node process.
  // Rely on terminal driver default ^C to kill the entire process group.
  console.log(
    "Orchestrator has shut down. Press ^C again to kill background processes that we don't currently kill automatically.",
  );
  if (exitCode) {
    (typeof process !== "undefined" ? (process as any).exitCode = exitCode : (typeof Deno !== "undefined" ? (Deno as any).exitCode = exitCode : undefined));
  }
}

async function awaitShutdown(): Promise<ProcessComponent[]> {
  // Wait a bit to let processes exit on their own.
  let maxWait = 5000;
  while (
    maxWait > 0 &&
    processes.some((p) => p.alive && p.component !== ComponentNames.TMUX)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    maxWait -= 100;
  }

  // Document and wait for each process that must be force-killed.
  const forced = [];
  const promises = [];
  for (const p of processes) {
    // Cancel pipes.
    if (p.is_piped.stderr) {
      p.process.stderr.cancel();
    }
    if (p.is_piped.stdout) {
      p.process.stdout.cancel();
    }
    if (p.component !== ComponentNames.TMUX) {
      if (p.alive) {
        forced.push(p);
        promises.push(kill(p.process));
      }
    }
  }
  await Promise.all(promises);
  return forced;
}

let failed = false;
export const processes: ProcessComponent[] = [];

export const terminateProcess = (processIndex: number) => {
  const process = processes[processIndex];
  if (process && process.alive) {
    process._allow_restart = true;
    kill(process.process);
    process.alive = false;
    process.date = new Date().toISOString();
  }
};

/** Send SIGTERM first, then SIGKILL after one second. */
async function kill(proc: SpawnChild): Promise<void> {
  try {
    proc.kill("SIGTERM");
    const hardKillTimer = setTimeout(
      () => proc.kill("SIGKILL"),
      1000,
    );
    await proc.status;
    clearTimeout(hardKillTimer);
  } catch (e) {
    // Usually "Child process has already terminated".
  }
}

export const $ = (params: {
  command?: string;
  args: string[]; // parsing string->string[] automatically is blocked on https://github.com/denoland/deno_task_shell/pull/137
  log?: LogHandler;
  cwd?: string;
  component: ValueOf<typeof ComponentNames>;
  namespace?: Namespace;
  abortController: AbortController;
  stdin?: "inherit" | "piped" | "null" | undefined;
  stdout?: "inherit" | "piped" | "null" | undefined;
  stderr?: "inherit" | "piped" | "null" | undefined;
  link?: string;
  critical?: boolean;
  env?: Record<string, string>;
}): ProcessComponent => {
  if (failed) {
    throw new AbortProcessStart("Shutdown already called");
  }
  const command = params.command ?? "deno";
  const child = spawn(command, {
    args: params.args,
    signal: params.abortController.signal,
    stderr: params.stderr ?? "piped",
    stdout: params.stdout ?? "piped",
    stdin: params.stdin ?? "inherit",
    env: { ...params.env, FORCE_COLOR: "true" },
    cwd: params.cwd,
  });
  child.ref();

  const processComponent: ProcessComponent = {
    process: child,
    abortController: params.abortController,
    args: [command, ...params.args],
    alive: true,
    date: new Date().toISOString(),
    component: params.component,
    is_piped: {
      stderr: params.stderr === "piped",
      stdout: params.stdout === "piped",
    },
    link: params.link ?? "",
    critical: params.critical ?? true,
  };
  processes.push(processComponent);

  if (params.log != null) {
    child.stdout.pipeTo(
      streamTo(
        params.log,
        "stdout",
        params.component ?? ComponentNames.ORCHESTRATOR,
        params.namespace ?? [],
      ),
    );
    child.stderr.pipeTo(
      streamTo(
        params.log,
        "stderr",
        params.component ?? ComponentNames.ORCHESTRATOR,
        params.namespace ?? [],
      ),
    );
  }

  // note: don't block on this
  void child.status.then((status) => {
    systemLog(
      `Process ${processComponent.component} (${processComponent.process.pid}) finished.\n`,
    );
    processComponent.alive = false;
    processComponent.date = new Date().toISOString();
    if (processComponent._allow_restart) {
      processComponent._allow_restart = false;
      return;
    }
    if (processComponent.component === ComponentNames.TMUX) {
      shutdown(0);
      return;
    }
    if (!status.success) {
      if (!processComponent.critical) {
        systemLog(
          `Non-critical process ${processComponent.component} (${processComponent.process.pid}) exited with status ${status.signal ?? status.code}; keeping orchestrator alive.`,
        );
        return;
      }
      if (!failed) {
        // usually if a :wait command fails, it because another command failed first
        // and we don't want the :wait command failure to swallow the real failure reason
        if (params.args[params.args.length - 1].endsWith(":wait")) {
          return;
        }
        // Temporary solution to event loop panic on unstable deno cjs module detecttion
        // TODO: Remove this once we have a stable deno cjs module detection
        if (params.args.includes("midnight-contract:deploy")) {
          return;
        }
        shutdown(
          1,
          shutdownCalled
            ? ""
            : `Shutdown caused by \`${
              processComponent.args.join(" ")
            }\`, status ${status.signal ?? status.code}`,
        );
      }
      failed = true;
    }
  });

  return processComponent;
};
