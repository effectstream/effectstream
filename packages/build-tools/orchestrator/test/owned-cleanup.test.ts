import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { ProcessConfig } from "../src/config.ts";
import { collectConfiguredPortListeners } from "../src/commands/stop.ts";
import { isPortInUse, waitForPort } from "../src/port-check.ts";
import { ProcessManager, type ManagedSignal } from "../src/process-manager.ts";

const fixture = path.join(import.meta.dir, "process-tree-fixture.ts");
const servers = new Set<net.Server>();
const managers = new Set<ProcessManager>();

async function listenOnRandomPort(): Promise<{ server: net.Server; port: number }> {
  for (;;) {
    const server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (typeof address !== "string" && address && address.port > 10000) {
      servers.add(server);
      return { server, port: address.port };
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function randomFreePort(): Promise<number> {
  const { server, port } = await listenOnRandomPort();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  servers.delete(server);
  return port;
}

async function waitForPortToClose(port: number, timeoutMs = 2_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortInUse(port))) return true;
    await Bun.sleep(25);
  }
  return !(await isPortInUse(port));
}

async function closeServer(server: net.Server): Promise<void> {
  if (!servers.delete(server)) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  for (const manager of managers) await manager.stopAll();
  managers.clear();
  for (const server of [...servers]) await closeServer(server);
});

function fixtureConfig(name: string, mode: string, port: number): ProcessConfig {
  return {
    name,
    command: process.execPath,
    args: [fixture, mode, String(port)],
    stopProcessAtPort: [port],
  };
}

describe("ownership-safe configured ports", () => {
  test("an unrelated native listener causes startup refusal and remains alive", async () => {
    const { server, port } = await listenOnRandomPort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({ onSignal: (signal) => signals.push(signal) });
    managers.add(manager);

    await expect(manager.launch(fixtureConfig("conflict", "listener", port))).rejects.toThrow(
      new RegExp(`port ${port}`, "i"),
    );
    await manager.stopAll();

    expect(await isPortInUse(port)).toBe(true);
    expect(server.listening).toBe(true);
    expect(signals).toEqual([]);
  });

  test("owned process-group shutdown closes descendants and preserves another group", async () => {
    const ownedPort = await randomFreePort();
    const unrelated = await listenOnRandomPort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({ onSignal: (signal) => signals.push(signal) });
    managers.add(manager);

    await manager.launch(fixtureConfig("wrapper", "wrapper", ownedPort));
    expect(await waitForPort(ownedPort, 5_000)).toBe(true);
    expect(await manager.stop("wrapper")).toBe(true);

    expect(await waitForPortToClose(ownedPort)).toBe(true);
    expect(await isPortInUse(unrelated.port)).toBe(true);
    expect(signals.map(({ target, signal }) => ({ target, signal }))).toEqual([
      { target: "process-group", signal: "SIGTERM" },
    ]);
  });

  test("stopAll retains authenticated cleanup after the wrapper exits before its descendant", async () => {
    const ownedPort = await randomFreePort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({ onSignal: (signal) => signals.push(signal) });
    managers.add(manager);

    const { waitForExit } = await manager.launch(
      fixtureConfig("early-wrapper", "wrapper-exit", ownedPort),
    );
    expect(await waitForPort(ownedPort, 5_000)).toBe(true);
    expect(await waitForExit).toBe(0);
    expect(manager.get("early-wrapper")?.status).toBe("done");
    expect(manager.isRunning("early-wrapper")).toBe(true);

    await manager.stopAll();

    expect(await waitForPortToClose(ownedPort)).toBe(true);
    expect(signals.map(({ target, signal }) => ({ target, signal }))).toEqual([
      { target: "process-group", signal: "SIGTERM" },
    ]);
    expect(manager.isRunning("early-wrapper")).toBe(false);
  });

  test("partial start and repeated stop signal only the live owned group", async () => {
    const ownedPort = await randomFreePort();
    const unrelated = await listenOnRandomPort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({ onSignal: (signal) => signals.push(signal) });
    managers.add(manager);

    await manager.launch(fixtureConfig("owned", "listener", ownedPort));
    expect(await waitForPort(ownedPort, 5_000)).toBe(true);
    await expect(manager.launch(fixtureConfig("blocked", "listener", unrelated.port))).rejects.toThrow();
    expect(await manager.stop("owned")).toBe(true);
    expect(await manager.stop("owned")).toBe(false);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.target).toBe("process-group");
    expect(await isPortInUse(unrelated.port)).toBe(true);
  });

  test("a replacement listener cannot inherit ownership from an exited child", async () => {
    const port = await randomFreePort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({ onSignal: (signal) => signals.push(signal) });
    managers.add(manager);
    const { waitForExit } = await manager.launch({
      name: "short",
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      stopProcessAtPort: [port],
      waitToExit: true,
    });
    await waitForExit;

    const replacement = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve, reject) => {
      replacement.once("error", reject);
      replacement.listen(port, "127.0.0.1", resolve);
    });
    servers.add(replacement);

    expect(await manager.stop("short")).toBe(false);
    expect(signals).toEqual([]);
    expect(await isPortInUse(port)).toBe(true);
  });

  test("missing-daemon inspection reports listeners without a signaling primitive", async () => {
    const unrelated = await listenOnRandomPort();
    const matches = await collectConfiguredPortListeners([
      { name: "unrelated", args: [], stopProcessAtPort: [unrelated.port] },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.port).toBe(unrelated.port);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-fallback-"));
    const configPath = path.join(tempDir, "orchestrator.config.ts");
    const apiPort = await randomFreePort();
    fs.writeFileSync(
      configPath,
      `export default { processes: [{ name: "unrelated", args: [], stopProcessAtPort: [${unrelated.port}] }] };`,
    );
    const cli = path.join(import.meta.dir, "../src/cli.ts");
    try {
      const stop = Bun.spawn(
        [process.execPath, cli, "stop", `--config=${configPath}`, `--port=${apiPort}`],
        { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        stop.exited,
        new Response(stop.stdout).text(),
        new Response(stop.stderr).text(),
      ]);
      expect(exitCode).toBe(1);
      expect(`${stdout}\n${stderr}`).toContain("Refusing to signal");
      expect(`${stdout}\n${stderr}`).toContain(`port ${unrelated.port}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    expect(await isPortInUse(unrelated.port)).toBe(true);
  });

  test("an injected Docker Desktop shared listener is diagnostic-only", async () => {
    const port = await randomFreePort();
    const signals: ManagedSignal[] = [];
    const health = { unrelatedContainer: "healthy" };
    const manager = new ProcessManager({
      inspectPorts: async () => [{ port, pids: [4242] }],
      onSignal: (signal) => signals.push(signal),
    });
    managers.add(manager);

    await expect(manager.launch(fixtureConfig("docker-collision", "listener", port))).rejects.toThrow(
      /PID 4242/,
    );
    expect(signals).toEqual([]);
    expect(health.unrelatedContainer).toBe("healthy");
  });

  test("top-level SIGTERM shuts down the owned group through the manager", async () => {
    const port = await randomFreePort();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-sigterm-"));
    const configPath = path.join(tempDir, "orchestrator.config.ts");
    const signalLog = path.join(tempDir, "signals.log");
    fs.writeFileSync(
      configPath,
      `export default { processes: [{ name: "signal-child", command: ${JSON.stringify(process.execPath)}, args: [${JSON.stringify(fixture)}, "signal-listener", "${port}"], env: { TEST_SIGNAL_LOG: ${JSON.stringify(signalLog)} }, stopProcessAtPort: [${port}] }] };`,
    );
    const cli = path.join(import.meta.dir, "../src/cli.ts");
    const orchestrator = Bun.spawn(
      [process.execPath, cli, "start", configPath, "--no-api"],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
    try {
      expect(await waitForPort(port, 5_000)).toBe(true);
      orchestrator.kill("SIGTERM");
      await orchestrator.exited;
      expect(await isPortInUse(port)).toBe(false);
      expect(fs.readFileSync(signalLog, "utf8").trim().split("\n")).toEqual(["SIGTERM"]);
    } finally {
      if (orchestrator.exitCode === null) orchestrator.kill("SIGKILL");
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("owned escalation records TERM then KILL against the same group", async () => {
    const port = await randomFreePort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({
      stopTimeoutMs: 100,
      onSignal: (signal) => signals.push(signal),
    });
    managers.add(manager);

    await manager.launch(fixtureConfig("stubborn", "wrapper-stubborn", port));
    expect(await waitForPort(port, 5_000)).toBe(true);
    expect(await manager.stop("stubborn")).toBe(true);

    expect(signals.map(({ target, signal, id }) => ({ target, signal, id }))).toEqual([
      { target: "process-group", signal: "SIGTERM", id: signals[0]?.id },
      { target: "process-group", signal: "SIGKILL", id: signals[0]?.id },
    ]);
    expect(await waitForPortToClose(port)).toBe(true);
  });

  test("PGID reuse before escalation loses authorization and sends no KILL", async () => {
    const signals: ManagedSignal[] = [];
    let termSent = false;
    let postTermInspections = 0;
    const manager = new ProcessManager({
      stopTimeoutMs: 40,
      createOwnerToken: () => "deterministic-owner-token",
      inspectProcessGroup: (processGroupId) => {
        if (termSent && ++postTermInspections >= 2) {
          return [{
            pid: processGroupId,
            processGroupId,
            state: "S",
            startToken: "reused-start-token",
            // Even a copied/inherited owner token cannot authorize a reused
            // numeric identity whose non-reusable start token changed.
            ownerTokenMatches: true,
          }];
        }
        return [{
          pid: processGroupId,
          processGroupId,
          state: "S",
          startToken: "owned-start-token",
          ownerTokenMatches: true,
        }];
      },
      signalProcessGroup: (_processGroupId, signal) => {
        if (signal === "SIGTERM") termSent = true;
      },
      onSignal: (signal) => signals.push(signal),
    });
    managers.add(manager);

    const { waitForExit } = await manager.launch({
      name: "reused-group",
      command: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 150)"],
    });
    expect(await manager.stop("reused-group")).toBe(false);
    expect(signals.map(({ signal }) => signal)).toEqual(["SIGTERM"]);
    await waitForExit;
  });

  test("concurrent stops coalesce into one authenticated signal sequence", async () => {
    const port = await randomFreePort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({ onSignal: (signal) => signals.push(signal) });
    managers.add(manager);

    await manager.launch(fixtureConfig("coalesced", "listener", port));
    expect(await waitForPort(port, 5_000)).toBe(true);
    expect(await Promise.all([manager.stop("coalesced"), manager.stop("coalesced")])).toEqual([
      true,
      true,
    ]);

    expect(signals.map(({ target, signal }) => ({ target, signal }))).toEqual([
      { target: "process-group", signal: "SIGTERM" },
    ]);
    expect(await waitForPortToClose(port)).toBe(true);
  });

  test("Windows policy targets only the recorded direct child", async () => {
    const port = await randomFreePort();
    const signals: ManagedSignal[] = [];
    const manager = new ProcessManager({
      platform: "win32",
      onSignal: (signal) => signals.push(signal),
    });
    managers.add(manager);

    await manager.launch(fixtureConfig("windows-child", "listener", port));
    expect(await waitForPort(port, 5_000)).toBe(true);
    expect(await manager.stop("windows-child")).toBe(true);

    expect(signals.map(({ target, signal }) => ({ target, signal }))).toEqual([
      { target: "direct-child", signal: "SIGTERM" },
    ]);
    expect(await waitForPortToClose(port)).toBe(true);
  });
});
