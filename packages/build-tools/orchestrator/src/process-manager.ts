import * as fs from "fs";
import * as path from "path";
import type { ProcessConfig } from "./config.ts";
import { inspectPorts, PortConflictError, type PortListener } from "./port-check.ts";

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
  /** Internal POSIX process-group ID for this launch; absent/null on Windows. */
  processGroupId?: number | null;
  /** Absolute path to the log file, or null if logging to terminal. */
  logFile: string | null;
};

type BunProc = ReturnType<typeof Bun.spawn>;
type StreamReader = ReadableStreamDefaultReader<Uint8Array>;

export type ChangeListener = (p: ManagedProcess) => void;

type StopSignal = "SIGTERM" | "SIGKILL";

export type ManagedSignal = {
  name: string;
  target: "process-group" | "direct-child";
  id: number;
  signal: StopSignal;
};

export type ProcessManagerOptions = {
  platform?: NodeJS.Platform;
  stopTimeoutMs?: number;
  inspectPorts?: (ports: number[]) => Promise<PortListener[]>;
  onSignal?: (attempt: ManagedSignal) => void;
};

export class ProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private procs = new Map<string, BunProc>();
  /** Active stream readers per process — cancelled on stop to release file descriptors. */
  private readers = new Map<string, StreamReader[]>();
  private listeners: ChangeListener[] = [];
  /** Processes currently being intentionally stopped/restarted — suppress exit handlers. */
  private stopping = new Set<string>();
  /** Processes whose terminal output is suppressed. */
  private silenced = new Set<string>();
  /**
   * When set, each process's stdout+stderr are appended to
   * `<logDir>/<process-name>.log` instead of inheriting the terminal.
   */
  logDir: string | undefined;
  private readonly platform: NodeJS.Platform;
  private readonly stopTimeoutMs: number;
  private readonly inspectConfiguredPorts: (ports: number[]) => Promise<PortListener[]>;
  private readonly onSignal: ((attempt: ManagedSignal) => void) | undefined;

  constructor(options: ProcessManagerOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
    this.inspectConfiguredPorts = options.inspectPorts ?? inspectPorts;
    this.onSignal = options.onSignal;
  }

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
    const occupied = await this.inspectConfiguredPorts(config.stopProcessAtPort ?? []);
    if (occupied.length > 0) throw new PortConflictError(occupied);

    const command = config.command ?? "bun";

    // Resolve log file destination
    let logFile: string | null = null;
    let outFd: number | "inherit" = "inherit";
    if (this.logDir) {
      logFile = path.join(this.logDir, `${config.name}.log`);
      // Open in append mode so restarts accumulate in the same file
      outFd = fs.openSync(logFile, "a");
    }

    // When logging to a file, write directly to the fd.
    // Otherwise, pipe output so we can suppress silenced processes.
    const usesPipe = typeof outFd !== "number";

    // Build child env. When writing to a file fd, suppress ANSI/TTY noise:
    //   - Strip FORCE_COLOR (inherited from parent or set by orchestrator) so
    //     children don't emit color escapes.
    //   - Set NO_COLOR=1 (broadly respected) and CI=1 to coax bun's
    //     `--filter` runner out of its live-redraw TTY mode, which would
    //     otherwise leave cursor-move escapes and "[N lines elided]" in logs.
    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      ...config.env,
    };
    if (usesPipe) {
      childEnv.FORCE_COLOR = "true";
    } else {
      delete childEnv.FORCE_COLOR;
      childEnv.NO_COLOR = "1";
      childEnv.CI = "1";
    }

    const proc = Bun.spawn([command, ...config.args], {
      env: childEnv,
      cwd: config.cwd ?? process.cwd(),
      stdout: usesPipe ? "pipe" : outFd,
      stderr: usesPipe ? "pipe" : outFd,
      stdin: "ignore",
      // A POSIX detached child leads a new process group, which gives cleanup a
      // trusted descendant boundary. Windows retains safe direct-child stop.
      detached: this.platform !== "win32",
    });

    // The child has inherited the fd — safe to close the parent's copy
    if (typeof outFd === "number") fs.closeSync(outFd);

    // Forward piped output to the terminal unless silenced, prefixed with [name]
    if (usesPipe) {
      const prefix = `\x1b[36m[${config.name}]\x1b[0m `;
      const prefixBytes = new TextEncoder().encode(prefix);
      const newline = 0x0a; // '\n'
      const activeReaders: StreamReader[] = [];

      const forward = (stream: ReadableStream<Uint8Array> | null, dest: typeof process.stdout) => {
        if (!stream) return;
        const reader = stream.getReader();
        activeReaders.push(reader);
        let atLineStart = true;

        const pump = (): void => {
          reader.read().then(({ done, value }) => {
            if (done) {
              reader.releaseLock();
              return;
            }
            if (this.silenced.has(config.name)) {
              pump();
              return;
            }

            // Prefix each line with [processName]
            const chunks: Uint8Array[] = [];
            let start = 0;
            for (let i = 0; i < value.length; i++) {
              if (atLineStart) {
                chunks.push(prefixBytes);
                atLineStart = false;
              }
              if (value[i] === newline) {
                chunks.push(value.subarray(start, i + 1));
                start = i + 1;
                atLineStart = true;
              }
            }
            // Remaining bytes after last newline
            if (start < value.length) {
              chunks.push(value.subarray(start));
            }

            for (const chunk of chunks) {
              dest.write(chunk);
            }
            pump();
          }).catch(() => {});
        };
        pump();
      };
      forward(proc.stdout as ReadableStream<Uint8Array>, process.stdout);
      forward(proc.stderr as ReadableStream<Uint8Array>, process.stderr);
      this.readers.set(config.name, activeReaders);
    }

    const managed: ManagedProcess = {
      name: config.name,
      pid: proc.pid,
      ports: config.stopProcessAtPort ?? [],
      status: "running",
      config,
      startedAt: new Date(),
      endedAt: null,
      exitCode: null,
      processGroupId: this.platform === "win32" ? null : proc.pid,
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

    this.stopping.add(name);

    // Cancel active stream readers to release file descriptors
    const readers = this.readers.get(name);
    if (readers) {
      for (const reader of readers) {
        reader.cancel().catch(() => {});
      }
      this.readers.delete(name);
    }

    this.signalOwned(proc, managed, "SIGTERM");

    // A wrapper can exit while one of its descendants remains in the owned
    // POSIX group. Wait for the ownership boundary itself, not only the direct
    // child's exit promise.
    const graceful = await this.waitForOwnedExit(proc, managed, this.stopTimeoutMs);

    if (!graceful) {
      this.signalOwned(proc, managed, "SIGKILL");
      await proc.exited.catch(() => {});
      await this.waitForOwnedExit(proc, managed, 1_000);
    }

    managed.status = "stopped";
    managed.endedAt = new Date();
    this.procs.delete(name);
    this.stopping.delete(name);
    this.emit(managed);
    return true;
  }

  private signalOwned(proc: BunProc, managed: ManagedProcess, signal: StopSignal): void {
    const target = managed.processGroupId == null ? "direct-child" : "process-group";
    const id = managed.processGroupId ?? proc.pid;
    try {
      if (target === "process-group") process.kill(-id, signal);
      else proc.kill(signal);
      this.onSignal?.({ name: managed.name, target, id, signal });
    } catch (error: any) {
      // An already-exited owned target makes stop idempotent. Never fall back
      // to looking up or signaling a listener by configured port.
      if (error?.code !== "ESRCH") throw error;
    }
  }

  private async waitForOwnedExit(
    proc: BunProc,
    managed: ManagedProcess,
    timeoutMs: number,
  ): Promise<boolean> {
    if (managed.processGroupId == null) {
      return Promise.race([
        proc.exited.then(() => true),
        Bun.sleep(timeoutMs).then(() => false),
      ]);
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.isProcessGroupAlive(managed.processGroupId)) return true;
      await Bun.sleep(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    return !this.isProcessGroupAlive(managed.processGroupId);
  }

  private isProcessGroupAlive(processGroupId: number): boolean {
    if (this.platform === "linux") {
      try {
        return fs.readdirSync("/proc", { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
          .some((entry) => {
            try {
              const stat = fs.readFileSync(`/proc/${entry.name}/stat`, "utf8");
              const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
              const state = fields[0];
              const group = Number(fields[2]);
              return group === processGroupId && state !== "Z";
            } catch {
              return false;
            }
          });
      } catch {
        // Fall through to ps/kill probes on restricted procfs mounts.
      }
    }

    // `kill(-pgid, 0)` also reports zombie-only groups as alive. Prefer the
    // portable macOS/Linux `ps -axo` view so reaping latency does not force an
    // unnecessary five-second wait or escalation.
    try {
      const result = Bun.spawnSync(["ps", "-axo", "pgid=,stat="], { stderr: "pipe" });
      if (result.exitCode === 0) {
        const hasLiveMember = result.stdout
          .toString()
          .split("\n")
          .map((line) => line.trim().match(/^(\d+)\s+(\S+)/))
          .filter((match): match is RegExpMatchArray => match !== null)
          .some((match) => Number(match[1]) === processGroupId && !match[2].startsWith("Z"));
        return hasLiveMember;
      }
    } catch {
      // Fall through to the signal-free existence probe if ps is unavailable.
    }
    try {
      process.kill(-processGroupId, 0);
      return true;
    } catch (error: any) {
      if (error?.code === "ESRCH") return false;
      throw error;
    }
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

  /** Returns true if the process is being intentionally stopped (via stop/restart). */
  isStopping(name: string): boolean {
    return this.stopping.has(name);
  }

  /** Suppress terminal output for the named process. */
  silence(name: string): void {
    this.silenced.add(name);
  }

  /** Resume terminal output for the named process. */
  unsilence(name: string): void {
    this.silenced.delete(name);
  }

  /** Returns the set of currently silenced process names. */
  getSilenced(): string[] {
    return [...this.silenced];
  }
}
