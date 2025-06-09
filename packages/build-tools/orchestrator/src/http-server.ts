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
      date: p.date,
    })),
  };
});

// TODO: Move this to the env/config loader.
const env: (string | { name: string; isSecret?: boolean })[] = [
  "DB_HOST",
  "DB_NAME",
  "DB_PORT",
  "DB_PW",
  "DB_USER",
  "MQTT_BATCHER_BROKER_URL",
  "MQTT_BROKER",
  "MQTT_BROKER_PORT",
  "MQTT_ENGINE_BROKER_URL",
  "NODE_ENV",
  "ORCHESTRATOR_PORT",
  "RECAPTCHA_V3_FRONTEND",
  "SHELL",
  "STORE_HISTORICAL_GAME_INPUTS",
];
server.get("/setup", function handler() {
  const obj: Record<string, string> = {};
  env.forEach((e) => {
    if (typeof e === "string") {
      obj[e] = Deno.env.get(e) ?? "undefined";
    } else {
      obj[e.name] = e.isSecret
        ? "********"
        : Deno.env.get(e.name) ?? "undefined";
    }
  });
  return obj;
});

// Run the server!
const port = Deno.env.get("ORCHESTRATOR_PORT")
  ? Number(Deno.env.get("ORCHESTRATOR_PORT"))
  : 3000;

try {
  await server.listen({ port });
} catch (err) {
  server.log.error(err);
  Deno.exit(1);
}
