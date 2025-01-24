import { type LogHandler, streamTo } from "./logging.ts";
import type { Namespace } from "@paima/log";
import { ComponentNames } from "@paima/log";
import type { ValueOf } from "@paima/utils";

export const AbortControllers = {
  chain: new AbortController(),
  db: new AbortController(),
  node: new AbortController(),
  shortLived: new AbortController(),
};

export function shutdown(): void {
  Object.values(AbortControllers).forEach((controller) => {
    controller.abort();
  });
}

export const $ = (params: {
  // recall: ["exec", ...] to run arbitrary code
  args: string[]; // parsing string->string[] automatically is blocked on https://github.com/denoland/deno_task_shell/pull/137
  signal?: AbortController;
  log?: LogHandler;
  component?: ValueOf<typeof ComponentNames>;
  namespace?: Namespace;
}): Deno.ChildProcess => {
  const process = new Deno.Command("deno", {
    args: params.args,
    signal: (params.signal ?? AbortControllers.shortLived).signal,
    stderr: "piped",
    stdout: "piped",
    env: { FORCE_COLOR: "true" },
  }).spawn();

  if (params.log != null) {
    process.stdout.pipeTo(
      streamTo(params.log, "stdout", params.component ?? ComponentNames.ORCHESTRATOR, params.namespace ?? []),
    );
    process.stderr.pipeTo(
      streamTo(params.log, "stderr", params.component ?? ComponentNames.ORCHESTRATOR, params.namespace ?? []),
    );
  }

  // note: don't block on this
  void process.status.then((status) => {
    if (!status.success) {
      // TODO: we may not want to shut down everything - only certain groups
      shutdown();
      Deno.exit(1);
    }
  });

  return process;
};
