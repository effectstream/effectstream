import {
  type LogHandler,
  setCurrentOutput,
  streamTo,
  systemLog,
} from "./logging.ts";
import type { Namespace } from "@paima/log";
import { ComponentNames } from "@paima/log";
import type { ValueOf } from "@paima/utils";
import { abortControllers } from "./start.ts";

export type ProcessComponent = {
  abortController: AbortController;
  process: Deno.ChildProcess;
  component: ValueOf<typeof ComponentNames>;
  args: string[];
  alive: boolean;
  date: string;
  // This is internal temporal flag to notify that the next
  // "restart" is intended, so we do not stop paima-engine.
  _allow_restart?: boolean;
};

export class AbortProcessStart extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortProcessStart";
  }
}

const wait = (n: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, n));

let shutdownCalled = false;
export async function shutdown(exitCode: number = 0): Promise<void> {
  if (shutdownCalled) {
    return;
  }
  shutdownCalled = true;
  // We are shutting down the processes, so redirect logs to the stdout
  // So we see the shutdown messages.
  setCurrentOutput(["otel", "stdout"]);
  abortControllers.system.abort();
  abortControllers.noncritical.abort();
  await awaitShutdown();
  Deno.exit(exitCode);
}

async function awaitShutdown(): Promise<void> {
  let maxWait = 5000;
  while (processes.some((p) => p.alive && maxWait > 0)) {
    await wait(100);
    maxWait -= 100;
  }

  for (const p of processes) {
    if (p.alive) {
      console.log("Force killing process", p.process.pid);
      p.process.kill();
    }
  }

  await Promise.all(
    processes.map((process) => process.process[Symbol.asyncDispose]()),
  );
}

let failed = false;
export const processes: ProcessComponent[] = [];

export const $ = (params: {
  command?: string;
  args: string[]; // parsing string->string[] automatically is blocked on https://github.com/denoland/deno_task_shell/pull/137
  log?: LogHandler;
  component: ValueOf<typeof ComponentNames>;
  namespace?: Namespace;
  abortController: AbortController;
  stdin?: "inherit" | "piped" | "null" | undefined;
  stdout?: "inherit" | "piped" | "null" | undefined;
  stderr?: "inherit" | "piped" | "null" | undefined;
}): ProcessComponent => {
  if (failed) {
    throw new AbortProcessStart("Shutdown already called");
  }
  const process = new Deno.Command(params.command ?? "deno", {
    args: params.args,
    signal: params.abortController.signal,
    stderr: params.stderr ?? "piped",
    stdout: params.stdout ?? "piped",
    stdin: params.stdin ?? "inherit",
    env: { FORCE_COLOR: "true" },
  }).spawn();
  process.ref(); // wait until all child processes die before killing parent

  const processComponent: ProcessComponent = {
    process,
    abortController: params.abortController,
    args: params.args,
    alive: true,
    date: new Date().toISOString(),
    component: params.component,
  };
  processes.push(processComponent);

  if (params.log != null) {
    process.stdout.pipeTo(
      streamTo(
        params.log,
        "stdout",
        params.component ?? ComponentNames.ORCHESTRATOR,
        params.namespace ?? [],
      ),
    );
    process.stderr.pipeTo(
      streamTo(
        params.log,
        "stderr",
        params.component ?? ComponentNames.ORCHESTRATOR,
        params.namespace ?? [],
      ),
    );
  }

  // note: don't block on this
  void process.status.then((status) => {
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
      if (!failed) {
        // usually if a :wait command fails, it because another command failed first
        // and we don't want the :wait command failure to swallow the real failure reason
        if (params.args[params.args.length - 1].endsWith(":wait")) {
          return;
        }

        if (!shutdownCalled) {
          console.error("Shutdown caused by ", params.args);
        }
        shutdown(1);
      }
      failed = true;
    }
  });

  return processComponent;
};
