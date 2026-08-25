#!/usr/bin/env bun
import net from "node:net";
import { args } from "@effectstream/utils/runtime";

// Get port from arguments.
const portArgName = "--port";
const argv = args();
const portArgIndex = argv.indexOf(portArgName);
const portValue = portArgIndex !== -1 ? argv[portArgIndex + 1] : "5432";
const port = parseInt(portValue);
if (isNaN(port)) {
  throw new Error(`Port argument ${portArgName} is not a number`);
}

async function waitForDb(
  targetPort = port,
  host = "127.0.0.1",
  timeoutMs = 10_000,
): Promise<void> {
  console.log(`waiting for db on ${host}:${targetPort}`);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host, port: targetPort });
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
      });
      console.log(`✅ Database is ready on ${host}:${targetPort}`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Failed to connect to database at ${host}:${targetPort}.`, {
    cause: lastError,
  });
}

export { waitForDb };

if (import.meta.main) {
  await waitForDb();
}
