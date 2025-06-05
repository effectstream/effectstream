import fastify from "fastify";
import { processes } from "./process.ts";
import { startProcess } from "./start.ts";
import { systemLog } from "./logging.ts";

// This file is a HTTP server to expose process information to the TUI.

const server = fastify();

server.get("/processes", function handler() {
  return {
    processes: processes.map((p) => ({
      name: p.component,
      pid: p.process.pid,
      alive: p.alive,
      args: p.args,
      date: p.date,
    })),
  };
});

server.get("/setup", function handler() {
  const env: string[] = ["PORT", "HOME", "NODE_ENV", "BASE_URL"];
  const obj: Record<string, string> = {};
  env.forEach((e) => obj[e] = Deno.env.get(e) ?? "undefined");
  return obj;
});

server.post("/restart", async function handler(request) {
  const { pid } = request.body as { pid: number };
  const process = processes.find((p) => p.process.pid === pid);
  if (!process) {
    return { success: false, error: "Process not found" };
  }

  try {
    const wait = (n: number) =>
      new Promise((resolve) => setTimeout(resolve, n));
    systemLog("Terminating process...");

    process._allow_restart = true;
    process.process.kill("SIGINT");
    let maxWait = 10000;
    while (process.alive && maxWait > 0) {
      await wait(100);
      maxWait -= 100;
    }
    // If SIGINT does not finish the process, kill it with SIGKILL
    if (process.alive) {
      process.process.kill("SIGKILL");
    }
    if (process.component) {
      systemLog("Starting new process...");
      const p = await startProcess[process.component]();
      systemLog("Started Process " + p.process.pid);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Run the server!
const port = 3000;
try {
  await server.listen({ port });
} catch (err) {
  server.log.error(err);
  Deno.exit(1);
}
