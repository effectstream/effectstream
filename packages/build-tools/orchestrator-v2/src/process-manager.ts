import * as fs from "fs";
import * as path from "path";
import type { ProcessConfig } from "./config.ts";
import { freePort } from "./port-check.ts";

export type ProcessStatus = "pending" | "running" | "done" | "failed" | "stopped";

export type ManagedProcess = {
  name: string;
  pid: number | null;
  /** Ports this process is expected to occupy (from config.stopProcessAtPort). */
  ports: number[];
  status: ProcessStatus;
  config: ProcessConfig;
  startedAt: Date | null;
  endedAt: Date | null;
  exitCode: number | null;
  /** Absolute path to the log file, or null if logging to terminal. */
  logFile: string | null;
};

type BunProc = ReturnType<typeof Bun.spawn>;

export type ChangeListener = (p: ManagedProcess) => void;

export class ProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private procs = new Map<string, BunProc>();
  private listeners: ChangeListener[] = [];
  /**
   * When set, each process's stdout+stderr are appended to
   * `<logDir>/<process-name>.log` instead of inheriting the terminal.
   */
  logDir: string | undefined;

  onProcessChange(fn: ChangeListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  private emit(p: ManagedProcess) {
    for (const fn of this.listeners) fn(p);
  }

  getAll(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  get(name: string): ManagedProcess | undefined {
    return this.processes.get(name);
  }

  /**
   * Spawns the process described by `config`.
   * Returns a `waitForExit` promise that resolves with the exit code.
   * When `this.logDir` is set, stdout+stderr are appended to
   * `<logDir>/<name>.log` instead of the terminal.
   */
  async launch(config: ProcessConfig): Promise<{ waitForExit: Promise<number>; logFile: string | null }> {
    // Free any ports this process needs
    for (const port of config.stopProcessAtPort ?? []) {
      await freePort(port);
    }

    const command = config.command ?? "bun";

    // Resolve log file destination
    let logFile: string | null = null;
    let outFd: number | "inherit" = "inherit";
    if (this.logDir) {
      logFile = path.join(this.logDir, `${config.name}.log`);
      // Open in append mode so restarts accumulate in the same file
      outFd = fs.openSync(logFile, "a");
    }

    const proc = Bun.spawn([command, ...config.args], {
      env: {
        ...process.env,
        ...config.env,
        FORCE_COLOR: "true",
      },
      cwd: config.cwd ?? process.cwd(),
      stdout: outFd,
      stderr: outFd,
      stdin: "ignore",
    });

    // The child has inherited the fd — safe to close the parent's copy
    if (typeof outFd === "number") fs.closeSync(outFd);

    const managed: ManagedProcess = {
      name: config.name,
      pid: proc.pid,
      ports: config.stopProcessAtPort ?? [],
      status: "running",
      config,
      startedAt: new Date(),
      endedAt: null,
      exitCode: null,
      logFile,
    };

    this.processes.set(config.name, managed);
    this.procs.set(config.name, proc);
    this.emit(managed);

    const waitForExit = proc.exited.then((code) => {
      managed.status = code === 0 ? "done" : "failed";
      managed.exitCode = code;
      managed.endedAt = new Date();
      this.procs.delete(config.name);
      this.emit(managed);
      return code;
    });

    return { waitForExit, logFile };
  }

  /**
   * Sends SIGTERM to the named process; waits for it to exit.
   * Falls back to SIGKILL after 5 seconds.
   */
  async stop(name: string): Promise<boolean> {
    const proc = this.procs.get(name);
    const managed = this.processes.get(name);
    if (!proc || !managed) return false;

    proc.kill("SIGTERM");

    // Wait up to 5 s for graceful exit, then SIGKILL
    const graceful = await Promise.race([
      proc.exited.then(() => true),
      Bun.sleep(5000).then(() => false),
    ]);

    if (!graceful) {
      proc.kill("SIGKILL");
      await proc.exited.catch(() => {});
    }

    managed.status = "stopped";
    managed.endedAt = new Date();
    this.procs.delete(name);
    this.emit(managed);
    return true;
  }

  /** Stops and re-launches a process. Returns null if the process was never started. */
  async restart(name: string): Promise<{ waitForExit: Promise<number> } | null> {
    const managed = this.processes.get(name);
    if (!managed) return null;
    await this.stop(name);
    return this.launch(managed.config);
  }

  /** Stops all running processes in parallel. */
  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.procs.keys()).map((n) => this.stop(n)));
  }

  isRunning(name: string): boolean {
    return this.procs.has(name);
  }
}
