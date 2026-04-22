import type { ProcessConfig } from "../src/config.ts";

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
      args: ["-e", "process.argv.splice(1, 0, '_'); await import('@effectstream/db/start-pglite')", "--port", String(port)],
      stopProcessAtPort: [port],
      waitToExit: false,
      critical: true,
    },
    {
      name: DbNames.PGLITE_WAIT,
      description: `Wait for PGLite on port ${port}`,
      args: ["./node_modules/.bin/wait-on", `tcp:${port}`],
      waitToExit: true,
      dependsOn: [DbNames.PGLITE],
    },
  ];
}
