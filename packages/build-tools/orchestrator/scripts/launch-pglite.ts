import type { ProcessConfig } from "../src/config.ts";

const waitTcpScript = new URL("./wait-tcp.ts", import.meta.url).pathname;
const startPgliteScript = import.meta.resolve("@effectstream/db/start-pglite").replace("file://", "");

export const DbNames = {
  PGLITE: "pglite",
  PGLITE_WAIT: "pglite-wait",
} as const;

export function launchPglite(opts?: { port?: number }): ProcessConfig[] {
  const port = opts?.port ?? 5432;
  return [
    {
      name: DbNames.PGLITE,
      description: `PGLite embedded database (port ${port})`,
      args: [startPgliteScript, "--port", String(port)],
      stopProcessAtPort: [port],
      waitToExit: false,
      critical: true,
    },
    {
      name: DbNames.PGLITE_WAIT,
      description: `Wait for PGLite on port ${port}`,
      args: [waitTcpScript, String(port)],
      waitToExit: true,
      dependsOn: [DbNames.PGLITE],
    },
  ];
}
