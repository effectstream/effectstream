import fastify from "fastify";
import { type ProcessComponent, processes, shutdown } from "./process.ts";
import { ENV } from "@paima/utils";
// This file is a HTTP server to expose process information to the TUI.

const server = fastify();

function mapProcess(p: ProcessComponent) {
  return {
    name: p.component,
    pid: p.process.pid,
    alive: p.alive,
    args: p.args,
    date: p.date,
  };
}
server.get("/processes", function handler() {
  return {
    processes: processes.map(mapProcess),
  };
});

server.get("/setup", function handler() {
  const env = ENV.getCurrentConfig(false);
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) {
      env[key] = "undefined";
    }
  });
  return env;
});

server.get("/documentation", function handler() {
  return ENV.getDocumentation();
});

server.post("/shutdown", async function handler() {
  await shutdown(0, "Network shutdown");
  return {
    success: true,
    processes: processes.map(mapProcess),
  };
});

// Run the server!
try {
  await server.listen({ port: ENV.ORCHESTRATOR_PORT });
} catch (err) {
  server.log.error(err);
  Deno.exit(1);
}
