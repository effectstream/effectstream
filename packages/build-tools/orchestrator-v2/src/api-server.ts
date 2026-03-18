import type { ProcessConfig } from "./config.ts";
import type { ProcessManager, ManagedProcess } from "./process-manager.ts";
import { runProcesses, type RunOptions } from "./task-runner.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serialize(p: ManagedProcess) {
  return {
    name: p.name,
    pid: p.pid,
    ports: p.ports,
    status: p.status,
    startedAt: p.startedAt?.toISOString() ?? null,
    endedAt: p.endedAt?.toISOString() ?? null,
    exitCode: p.exitCode,
    link: p.config.link ?? null,
    critical: p.config.critical ?? true,
    description: p.config.description ?? null,
    logFile: p.logFile ?? null,
  };
}

export type ApiServerOptions = {
  port: number;
  manager: ProcessManager;
  /** Called when the /shutdown endpoint is hit. */
  onShutdown: () => Promise<void>;
  /** Callback hooks for task events (used by both local and remote starts). */
  runCallbacks?: Pick<RunOptions, "onTaskStart" | "onTaskRunning" | "onTaskDone" | "onTaskFailed" | "onShutdown">;
};

/**
 * Starts a Bun HTTP API server so that external CLI commands
 * (status, restart, stop) can communicate with the running daemon.
 *
 * Routes:
 *   GET  /health          → { ok: true }
 *   GET  /processes       → { processes: [...] }
 *   POST /restart         → { name } → restarts named process
 *   POST /stop            → { name? } → stops named process or all
 *   POST /shutdown        → graceful full shutdown
 */
export function startApiServer({ port, manager, onShutdown, runCallbacks }: ApiServerOptions): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // ── Health ────────────────────────────────────────────────────────────
      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true });
      }

      // ── Process list ──────────────────────────────────────────────────────
      if (req.method === "GET" && url.pathname === "/processes") {
        return json({ processes: manager.getAll().map(serialize) });
      }

      // ── Start additional processes ────────────────────────────────────────
      if (req.method === "POST" && url.pathname === "/start") {
        let body: { processes: ProcessConfig[]; only?: string[]; except?: string[]; serial?: boolean; noDeps?: boolean };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        if (!Array.isArray(body.processes) || body.processes.length === 0) {
          return json({ error: "Missing or empty field: processes" }, 400);
        }

        // Launch in the background so the HTTP response returns immediately
        runProcesses(body.processes, manager, {
          only: body.only,
          except: body.except,
          serial: body.serial,
          noDeps: body.noDeps,
          ...runCallbacks,
        }).catch((err) => {
          console.error(`[API /start] Error: ${err?.message ?? err}`);
        });

        // Report which processes will actually be considered (after filters)
        let queued = body.processes.map((p) => p.name);
        if (body.only) {
          const onlySet = new Set(body.only);
          queued = queued.filter((n) => onlySet.has(n));
        }
        if (body.except) {
          const exceptSet = new Set(body.except);
          queued = queued.filter((n) => !exceptSet.has(n));
        }

        return json({ success: true, queued });
      }

      // ── Restart ───────────────────────────────────────────────────────────
      if (req.method === "POST" && url.pathname === "/restart") {
        let body: { name: string };
        try {
          body = (await req.json()) as { name: string };
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        if (!body.name) return json({ error: "Missing field: name" }, 400);

        const result = await manager.restart(body.name);
        if (!result) {
          return json(
            { error: `No process named "${body.name}" found` },
            404,
          );
        }
        return json({ success: true, name: body.name });
      }

      // ── Stop ──────────────────────────────────────────────────────────────
      if (req.method === "POST" && url.pathname === "/stop") {
        let body: { name?: string } = {};
        try {
          body = (await req.json()) as { name?: string };
        } catch {
          /* empty body is fine */
        }

        if (body.name) {
          const ok = await manager.stop(body.name);
          if (!ok) {
            return json(
              { error: `No running process named "${body.name}"` },
              404,
            );
          }
          return json({ success: true, name: body.name });
        }

        await manager.stopAll();
        return json({ success: true, stopped: "all" });
      }

      // ── Shutdown ──────────────────────────────────────────────────────────
      if (req.method === "POST" && url.pathname === "/shutdown") {
        // Respond first, then shut down
        const response = json({ success: true });
        setImmediate(onShutdown);
        return response;
      }

      return json({ error: "Not found" }, 404);
    },
  });
}
