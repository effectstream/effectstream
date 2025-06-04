import fastify from "fastify";
import { processes } from "./process.ts";

// This file is a HTTP server to expose process information to the TUI.

const server = fastify();

server.get("/processes", function handler() {
  return {
    processes: processes.map((p) => ({
      name: p.component,
      pid: p.process.pid,
      alive: p.alive,
      args: p.args,
    })),
  };
});

server.get("/setup", function handler() {
  const env: string[] = ["PORT", "HOME", "NODE_ENV", "BASE_URL"];
  const obj: Record<string, string> = {};
  env.forEach((e) => obj[e] = Deno.env.get(e) ?? "undefined");
  return obj;
});

server.post("/restart", function handler(request) {
  const { pid } = request.body as { pid: number };
  const process = processes.find((p) => p.process.pid === pid);
  if (!process) {
    return { success: false, error: "Process not found" };
  }

  try {
    process.process.kill();
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
