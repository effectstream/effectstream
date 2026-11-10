export const DEFAULT_CKB_ACCEPTANCE_DB_PORT = 55432;
const MIN_UNPRIVILEGED_PORT = 1024;
const MAX_TCP_PORT = 65535;

export function resolveCkbAcceptanceDbPort(value?: string): number {
  if (value === undefined || value.trim() === "") return DEFAULT_CKB_ACCEPTANCE_DB_PORT;
  if (!/^\d+$/.test(value)) {
    throw new Error("CKB_ACCEPTANCE_DB_PORT must be an integer TCP port from 1024 to 65535.");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < MIN_UNPRIVILEGED_PORT || port > MAX_TCP_PORT) {
    throw new Error("CKB_ACCEPTANCE_DB_PORT must be an integer TCP port from 1024 to 65535.");
  }
  return port;
}

export function ckbAcceptanceDatabaseUrl(port: number): string {
  return `postgresql://effectstream@127.0.0.1:${port}/effectstream`;
}

export async function assertCkbAcceptancePortFree(
  port: number,
  isFree: (port: number) => Promise<boolean>,
): Promise<void> {
  if (!(await isFree(port))) {
    throw new Error(`Preflight refused to start: loopback port ${port} is already occupied. Choose another CKB_ACCEPTANCE_DB_PORT; no existing service will be stopped or reused.`);
  }
}

/** Only a PostgreSQL instance successfully started by this run may be stopped. */
export async function stopOwnedPostgres(
  startedByThisRun: boolean,
  stop: () => Promise<void>,
): Promise<void> {
  if (startedByThisRun) await stop();
}
