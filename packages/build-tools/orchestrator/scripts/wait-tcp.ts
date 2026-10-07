import { resolve } from "node:path";

export const DEFAULT_TCP_TIMEOUT_MS = 60_000;
export const DEFAULT_TCP_INTERVAL_MS = 500;

type CompatibilityTuple = {
  schemaVersion: number;
  node: { version: string; ledgerGeneration: number };
  indexer: { version: string };
  cachedChain: {
    policy: string;
    verifiedIncompatibilitySignal: string;
    projectLocalBasePath: string;
  };
};

export type WaitTcpOptions = {
  port: number;
  host?: string;
  service?: string;
  timeoutMs?: number;
  intervalMs?: number;
  logHint?: string;
  compatibilityFile?: string;
  connect?: () => Promise<boolean>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type WaitTcpResult = {
  ok: boolean;
  elapsedMs: number;
};

async function connectTcp(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolveConnection) => {
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      resolveConnection(connected);
    };

    Bun.connect({
      hostname: host,
      port,
      socket: {
        open(socket) {
          finish(true);
          socket.end();
        },
        data() {},
        error() {
          finish(false);
        },
        close() {
          finish(false);
        },
        connectError() {
          finish(false);
        },
      },
    }).catch(() => finish(false));
  });
}

async function readCompatibility(
  compatibilityFile: string,
): Promise<CompatibilityTuple> {
  const parsed = await Bun.file(compatibilityFile).json();
  if (
    parsed?.schemaVersion !== 1 ||
    typeof parsed?.node?.version !== "string" ||
    typeof parsed?.node?.ledgerGeneration !== "number" ||
    typeof parsed?.indexer?.version !== "string" ||
    typeof parsed?.cachedChain?.policy !== "string" ||
    typeof parsed?.cachedChain?.verifiedIncompatibilitySignal !== "string" ||
    typeof parsed?.cachedChain?.projectLocalBasePath !== "string"
  ) {
    throw new Error(`invalid compatibility tuple: ${compatibilityFile}`);
  }
  return parsed as CompatibilityTuple;
}

async function printTimeoutDiagnostics(
  options: Required<
    Pick<WaitTcpOptions, "host" | "port" | "service" | "timeoutMs" | "logHint">
  > &
    Pick<WaitTcpOptions, "compatibilityFile">,
  elapsedMs: number,
): Promise<void> {
  console.error(
    `Timed out waiting for ${options.service} at tcp://${options.host}:${options.port} after ${elapsedMs}ms (unknown readiness failure).`,
  );
  console.error(`Next action: ${options.logHint}`);

  if (!options.compatibilityFile) return;

  try {
    const compatibility = await readCompatibility(options.compatibilityFile);
    const localState = resolve(
      process.cwd(),
      compatibility.cachedChain.projectLocalBasePath,
    );
    console.error(
      `Bundled compatibility: node ${compatibility.node.version}, Ledger ${compatibility.node.ledgerGeneration}, indexer ${compatibility.indexer.version}; cached-chain policy ${compatibility.cachedChain.policy}.`,
    );
    console.error(
      `Possible stale state: only the exact node-log signal "${compatibility.cachedChain.verifiedIncompatibilitySignal}" proves an incompatible Ledger-8 cache. Without it, this remains an unknown readiness failure.`,
    );
    console.error(
      `Indexer --clean removes only indexer SQLite data. After stopping the stack, archive or remove only ${localState} if you choose a project-local node reset; no data is reset automatically.`,
    );
  } catch (error) {
    console.error(
      `Compatibility diagnostics unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function waitForTcp(
  options: WaitTcpOptions,
): Promise<WaitTcpResult> {
  const host = options.host ?? "127.0.0.1";
  const service = options.service ?? `tcp:${options.port}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TCP_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_TCP_INTERVAL_MS;
  const logHint = options.logHint ?? "inspect the owning service log";
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? Bun.sleep;
  const connect = options.connect ?? (() => connectTcp(host, options.port));

  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65_535
  ) {
    throw new Error(`invalid TCP port: ${options.port}`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`invalid timeout: ${timeoutMs}`);
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(`invalid interval: ${intervalMs}`);
  }

  const startedAt = now();
  while (now() - startedAt < timeoutMs) {
    if (await connect()) {
      return { ok: true, elapsedMs: now() - startedAt };
    }
    const remaining = timeoutMs - (now() - startedAt);
    if (remaining > 0) await sleep(Math.min(intervalMs, remaining));
  }

  const elapsedMs = now() - startedAt;
  await printTimeoutDiagnostics(
    {
      host,
      port: options.port,
      service,
      timeoutMs,
      logHint,
      compatibilityFile: options.compatibilityFile,
    },
    elapsedMs,
  );
  return { ok: false, elapsedMs };
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseWaitTcpArgs(args: string[]): WaitTcpOptions {
  const port = Number(args[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      "Usage: bun wait-tcp.ts <port> [--host <host>] [--service <label>] [--timeout-ms <milliseconds>] [--log-hint <hint>] [--compatibility-file <path>]",
    );
  }

  const options: WaitTcpOptions = { port };
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--host") {
      options.host = requireValue(args, index, flag);
      index += 1;
    } else if (flag === "--service") {
      options.service = requireValue(args, index, flag);
      index += 1;
    } else if (flag === "--timeout-ms") {
      options.timeoutMs = Number(requireValue(args, index, flag));
      index += 1;
    } else if (flag === "--interval-ms") {
      options.intervalMs = Number(requireValue(args, index, flag));
      index += 1;
    } else if (flag === "--log-hint") {
      options.logHint = requireValue(args, index, flag);
      index += 1;
    } else if (flag === "--compatibility-file") {
      options.compatibilityFile = requireValue(args, index, flag);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }
  return options;
}

export async function runWaitTcpCli(args: string[]): Promise<number> {
  try {
    const result = await waitForTcp(parseWaitTcpArgs(args));
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runWaitTcpCli(process.argv.slice(2));
}
