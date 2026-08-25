import { startPglite } from "../../../scripts/start-pglite.ts";

const handle = await startPglite(0);
console.info(`PGLITE_PROCESS_EXIT_PORT:${handle.port}`);

await new Promise<void>((resolve) => {
  handle.server.once("connection", () => resolve());
});
await handle.close();
console.info("PGLITE_PROCESS_EXIT_DEFAULT_CLOSED");
