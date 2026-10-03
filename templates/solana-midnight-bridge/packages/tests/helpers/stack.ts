// The local stack for the end-to-end suite: start start.test.ts with the
// orchestrator CLI (per-process logs under one directory), wait for it, control
// single processes through the orchestrator's HTTP API (stop / restart / a hard
// SIGKILL by pid), and shut it down.
//
// Everything listens inside this machine (or container): the orchestrator API
// on 4747, the node API on 9999, the chains on their default local ports.
import fs from "node:fs";
import path from "node:path";

export const TEMPLATE_ROOT = path.resolve(import.meta.dirname!, "../../..");
export const START_TEST_CONFIG = path.resolve(import.meta.dirname!, "../start.test.ts");

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ProcInfo = {
  name: string;
  pid: number;
  status: "running" | "done" | "failed" | "stopped" | string;
  exitCode: number | null;
  critical: boolean;
  logFile: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

export function orchestratorCliPath(root = TEMPLATE_ROOT): string {
  return path.join(root, "node_modules/@effectstream/orchestrator/src/cli.ts");
}

export class Orchestrator {
  constructor(public readonly port = Number(process.env.BRIDGE_E2E_ORCHESTRATOR_PORT ?? 4747)) {}

  private url(p: string): string {
    return `http://127.0.0.1:${this.port}${p}`;
  }

  async isUp(): Promise<boolean> {
    try {
      const res = await fetch(this.url("/health"), { signal: AbortSignal.timeout(3_000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async waitUp(timeoutMs = 120_000): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await this.isUp()) return;
      await delay(500);
    }
    throw new Error(`orchestrator API on :${this.port} did not answer within ${timeoutMs / 1000} s`);
  }

  async processes(): Promise<ProcInfo[]> {
    const res = await fetch(this.url("/processes"), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`GET /processes answered ${res.status}`);
    return ((await res.json()) as { processes: ProcInfo[] }).processes;
  }

  async proc(name: string): Promise<ProcInfo | null> {
    return (await this.processes()).find((p) => p.name === name) ?? null;
  }

  /**
   * Waits until `name` is running (or, with `exit`, has exited 0). A process that
   * failed fails fast instead of waiting out the timeout.
   */
  async waitFor(name: string, opts: { exit?: boolean; timeoutMs?: number } = {}): Promise<ProcInfo> {
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      let p: ProcInfo | null = null;
      try {
        p = await this.proc(name);
      } catch {
        /* API busy */
      }
      if (p) {
        if (p.status === "failed" || (p.status === "stopped" && !opts.exit)) {
          throw new Error(`process "${name}" ${p.status} (exit ${p.exitCode}); see ${p.logFile ?? "the orchestrator log"}`);
        }
        if (opts.exit && p.status === "done") return p;
        if (!opts.exit && (p.status === "running" || p.status === "done")) return p;
      }
      await delay(1_000);
    }
    throw new Error(`process "${name}" did not ${opts.exit ? "finish" : "start"} within ${timeoutMs / 1000} s`);
  }

  private async post(p: string, body: unknown): Promise<any> {
    const res = await fetch(this.url(p), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`POST ${p} ${JSON.stringify(body)} answered ${res.status}: ${JSON.stringify(j)}`);
    return j;
  }

  /** SIGTERM, then SIGKILL after 5 s (the orchestrator's own stop). */
  stop(name: string) {
    return this.post("/stop", { name });
  }

  /** Stops (if running) and launches the process again with its config. */
  restart(name: string) {
    return this.post("/restart", { name });
  }

  /**
   * A hard kill: SIGKILL to the process's pid, no graceful shutdown. Only for
   * non-critical processes (start.test.ts makes `sync` one); a critical one
   * would take the whole stack down with it.
   */
  async killHard(name: string): Promise<ProcInfo> {
    const p = await this.proc(name);
    if (!p || p.status !== "running") throw new Error(`process "${name}" is not running (${p?.status})`);
    if (p.critical) throw new Error(`process "${name}" is critical; a kill would stop the stack (use start.test.ts)`);
    process.kill(p.pid, "SIGKILL");
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000) {
      const q = await this.proc(name);
      if (q && q.status !== "running") return q;
      await delay(200);
    }
    throw new Error(`process "${name}" (pid ${p.pid}) still running after SIGKILL`);
  }

  async shutdown(): Promise<void> {
    try {
      await fetch(this.url("/shutdown"), { method: "POST", signal: AbortSignal.timeout(10_000) });
    } catch {
      /* already down */
    }
  }
}

export type StartedStack = {
  orchestrator: Orchestrator;
  child: ReturnType<typeof Bun.spawn>;
  logDir: string;
  stop: () => Promise<void>;
};

/**
 * Starts start.test.ts in the foreground with `--log-dir` (one log file per
 * process; the orchestrator's own output goes to `<logDir>/orchestrator.log`).
 */
export async function startStack(opts: { logDir: string; env?: Record<string, string> }): Promise<StartedStack> {
  const orchestrator = new Orchestrator();
  if (await orchestrator.isUp()) {
    throw new Error(`an orchestrator already answers on :${orchestrator.port}; stop it first (bunx orchestrator stop)`);
  }
  fs.mkdirSync(opts.logDir, { recursive: true });
  const out = fs.openSync(path.join(opts.logDir, "orchestrator.log"), "a");
  const child = Bun.spawn(
    ["bun", orchestratorCliPath(), "start", START_TEST_CONFIG, `--log-dir=${opts.logDir}`],
    {
      cwd: TEMPLATE_ROOT,
      stdout: out,
      stderr: out,
      stdin: "ignore",
      env: { ...process.env, ...opts.env } as Record<string, string>,
    },
  );
  fs.closeSync(out);
  await orchestrator.waitUp();
  const stop = async () => {
    await orchestrator.shutdown();
    const exited = await Promise.race([child.exited.then(() => true), delay(120_000).then(() => false)]);
    if (!exited) child.kill("SIGKILL");
  };
  return { orchestrator, child, logDir: opts.logDir, stop };
}

/**
 * Waits until `target` runs, failing fast when the orchestrator exits or a
 * critical process fails on the way (a failed deploy never starts `sync`).
 * Prints each process's first transition so a slow boot shows where it is.
 */
export async function waitForBoot(stack: StartedStack, target: string, timeoutMs: number): Promise<number> {
  const t0 = Date.now();
  let exited: number | null = null;
  stack.child.exited.then((c) => (exited = c));
  const seen = new Map<string, string>();
  while (Date.now() - t0 < timeoutMs) {
    if (exited !== null) throw new Error(`the orchestrator exited (code ${exited}) during boot; see ${stack.logDir}`);
    let procs: ProcInfo[] = [];
    try {
      procs = await stack.orchestrator.processes();
    } catch {
      /* busy */
    }
    for (const p of procs) {
      if (seen.get(p.name) !== p.status) {
        seen.set(p.name, p.status);
        console.log(`[stack] +${((Date.now() - t0) / 1000).toFixed(0)}s ${p.name}: ${p.status}${p.exitCode !== null ? ` (exit ${p.exitCode})` : ""}`);
      }
      if (p.status === "failed" && p.critical) {
        throw new Error(`process "${p.name}" failed (exit ${p.exitCode}) during boot; see ${p.logFile ?? stack.logDir}`);
      }
    }
    const t = procs.find((p) => p.name === target);
    if (t?.status === "running") return Date.now() - t0;
    await delay(2_000);
  }
  throw new Error(`"${target}" did not start within ${timeoutMs / 1000} s; see ${stack.logDir}`);
}

/** GET <api>/health until the runtime reports ok, then /transfers until it answers. */
export async function waitForNodeApi(api: string, timeoutMs = 600_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const h = await fetch(new URL("/health", api), { signal: AbortSignal.timeout(5_000) });
      if (h.ok) {
        const t = await fetch(new URL("/transfers", api), { signal: AbortSignal.timeout(5_000) });
        if (t.ok) return;
      }
    } catch {
      /* not up yet */
    }
    await delay(1_000);
  }
  throw new Error(`the bridge node API ${api} did not answer within ${timeoutMs / 1000} s`);
}
