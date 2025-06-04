import { type LogHandler, streamTo } from "./logging.ts";
import type { Namespace } from "@paima/log";
import { ComponentNames } from "@paima/log";
import type { ValueOf } from "@paima/utils";

export type ProcessComponent = {
  process: Deno.ChildProcess;
  component: ValueOf<typeof ComponentNames>;
  args: string[];
  alive: boolean;
};

export const AbortControllers = {
  chain: new AbortController(),
  otel: new AbortController(),
  db: new AbortController(),
  node: new AbortController(),
  shortLived: new AbortController(),
};

export class AbortProcessStart extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortProcessStart";
  }
}

export function shutdown(): void {
  const nonOtel = (Object.keys(
    AbortControllers,
  ) as (keyof typeof AbortControllers)[])
    // shutdown otel last we may have some error logs to write
    .filter((key) => key !== "otel");
  nonOtel.forEach((key) => {
    try {
      AbortControllers[key].abort();
    } catch {
      // do nothing
    }
  });
}

let failed = false;
export const processes: ProcessComponent[] = [];

export const $ = (params: {
  // recall: ["exec", ...] to run arbitrary code
  args: string[]; // parsing string->string[] automatically is blocked on https://github.com/denoland/deno_task_shell/pull/137
  signal?: AbortController;
  log?: LogHandler;
  component?: ValueOf<typeof ComponentNames>;
  namespace?: Namespace;
}): ProcessComponent => {
  if (failed) {
    throw new AbortProcessStart("Shutdown already called");
  }
  const process = new Deno.Command("deno", {
    args: params.args,
    signal: (params.signal ?? AbortControllers.shortLived).signal,
    stderr: "piped",
    stdout: "piped",
    env: { FORCE_COLOR: "true" },
  }).spawn();
  process.ref(); // wait until all child processes die before killing parent

  const processComponent = {
    process,
    args: params.args,
    alive: true,
    component: params.component ?? "unknown",
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
    processComponent.alive = false;
    if (!status.success) {
      if (!failed) {
        // usually if a :wait command fails, it because another command failed first
        // and we don't want the :wait command failure to swallow the real failure reason
        if (params.args[params.args.length - 1].endsWith(":wait")) {
          return;
        }
        shutdown();
        console.error("Shutdown caused by ", params.args);
      }
      failed = true;
    }
  });

  return processComponent;
};
