import {
  type LogHandler,
  setCurrentOutput,
  streamTo,
  systemLog,
} from "./logging.ts";
import type { Namespace } from "@paima/log";
import { ComponentNames } from "@paima/log";
import type { ValueOf } from "@paima/utils";
import { awaitShutdown } from "./start.ts";

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

export function shutdown(): void {
  processes.filter((p) => p.alive && p.component === ComponentNames.TUI)
    .forEach((p) => {
      p.abortController.abort();
    });

  // Switch to stdout, as we are shutting down the TUI
  setCurrentOutput("stdout");

  processes
    .filter((p) => {
      if (!p.alive) return false;
      // shutdown otel last we may have some error logs to write
      if (p.component === ComponentNames.COLLECTOR) return false;
      // shutdown tui last so we can show messages
      if (p.component === ComponentNames.TUI) return false;
      return true;
    })
    .forEach((process) => {
      // console.log("Shutting down process", process.component);
      process.abortController.abort();
    });

  processes
    .filter((p) => p.alive && p.component === ComponentNames.ORCHESTRATOR)
    .forEach((p) => {
      p.abortController.abort();
    });
}

let failed = false;
export const processes: ProcessComponent[] = [];

export const $ = (params: {
  // recall: ["exec", ...] to run arbitrary code
  args: string[]; // parsing string->string[] automatically is blocked on https://github.com/denoland/deno_task_shell/pull/137
  log?: LogHandler;
  component: ValueOf<typeof ComponentNames>;
  namespace?: Namespace;
}): ProcessComponent => {
  if (failed) {
    throw new AbortProcessStart("Shutdown already called");
  }
  const abortController = new AbortController();
  const process = new Deno.Command("deno", {
    args: params.args,
    signal: abortController.signal,
    stderr: "piped",
    stdout: "piped",
    env: { FORCE_COLOR: "true" },
  }).spawn();
  process.ref(); // wait until all child processes die before killing parent

  const processComponent: ProcessComponent = {
    process,
    abortController,
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
      "Process " + processComponent.process.pid + " finished. " +
        JSON.stringify(status) + " --- " + processComponent._allow_restart,
    );
    processComponent.alive = false;
    processComponent.date = new Date().toISOString();
    if (processComponent._allow_restart) {
      processComponent._allow_restart = false;
      return;
    }
    if (processComponent.component === ComponentNames.TUI) {
      shutdown();
      awaitShutdown().then(() => {
        Deno.exit(0);
      });
    }
    if (!status.success) {
      if (!failed) {
        // usually if a :wait command fails, it because another command failed first
        // and we don't want the :wait command failure to swallow the real failure reason
        if (params.args[params.args.length - 1].endsWith(":wait")) {
          return;
        }

        console.error("Shutdown caused by ", params.args);
        shutdown();
      }
      failed = true;
    }
  });

  return processComponent;
};
