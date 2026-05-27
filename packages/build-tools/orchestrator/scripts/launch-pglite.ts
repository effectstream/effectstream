import type { ProcessConfig } from "../src/config.ts";

const waitTcpScript = new URL("./wait-tcp.ts", import.meta.url).pathname;
const startPgliteScript = import.meta.resolve("@effectstream/db/start-pglite").replace("file://", "");

export const DbNames = {
  PGLITE: "pglite",
  PGLITE_WAIT: "pglite-wait",
} as const;

/**
 * Spawns the embedded PGlite database used by e2e suites — unless
 * `PGLITE=false` is set in the environment, in which case it assumes an
 * external Postgres is already running on `DB_PORT` (or `port`) and emits a
 * single wait task that other processes can still depend on via
 * `DbNames.PGLITE_WAIT`. This keeps the launcher.cli.ts call sites unchanged
 * while letting e2e_postgres.sh exercise the engine against a real Postgres
 * (e.g. to verify the pg_ivm-optional fallback path).
 */
export function launchPglite(opts?: { port?: number }): ProcessConfig[] {
  const defaultPort = opts?.port ?? 5432;

  if (process.env.PGLITE === "false") {
    const externalPort = process.env.DB_PORT ?? String(defaultPort);
    return [
      {
        name: DbNames.PGLITE_WAIT,
        description: `Wait for external Postgres on port ${externalPort}`,
        args: [waitTcpScript, String(externalPort)],
        waitToExit: true,
      },
    ];
  }

  return [
    {
      name: DbNames.PGLITE,
      description: `PGLite embedded database (port ${defaultPort})`,
      args: [startPgliteScript, "--port", String(defaultPort)],
      stopProcessAtPort: [defaultPort],
      waitToExit: false,
      critical: true,
    },
    {
      name: DbNames.PGLITE_WAIT,
      description: `Wait for PGLite on port ${defaultPort}`,
      args: [waitTcpScript, String(defaultPort)],
      waitToExit: true,
      dependsOn: [DbNames.PGLITE],
    },
  ];
}
