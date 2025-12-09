import fastify from "fastify";
import {
  type ProcessComponent,
  processes,
  shutdown,
  terminateProcess,
} from "./process.ts";
import { ENV } from "@effectstream/utils/node-env";
import { pFactory } from "./start.ts";
import { ComponentNames } from "@effectstream/log";
// This file is a HTTP server to expose process information to the TUI.

const server = fastify();

function mapProcess(p: ProcessComponent) {
  return {
    name: p.component,
    pid: p.process.pid,
    alive: p.alive,
    args: p.args,
    date: p.date,
    link: p.link,
    critical: p.critical,
  };
}
server.get("/processes", function handler() {
  return {
    processes: processes.map(mapProcess),
  };
});

server.get("/restart-sync", async function handler() {
  const syncProcessI = processes.findIndex(
    (p) => (p.component === ComponentNames.EFFECTSTREAM_SYNC && p.alive),
  );
  if (syncProcessI !== -1) {
    terminateProcess(syncProcessI);
    await pFactory![ComponentNames.EFFECTSTREAM_SYNC]();
  }

  return {
    success: true,
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
  // If ORCHESTRATOR_PORT was 0, set it for child processes to whatever
  // port we're actually listening on.
  const addr = server.server.address();
  if (ENV.ORCHESTRATOR_PORT === 0 && addr && typeof addr === "object") {
    console.log("ORCHESTRATOR_PORT set to", addr.port);
    ENV.ORCHESTRATOR_PORT = addr.port;
  }
} catch (err) {
  server.log.error(err);
  Deno.exit(1);
}
