import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";
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

export type ProcessGroupMemberIdentity = {
  pid: number;
  processGroupId: number;
  state: string;
  startToken: string;
  ownerTokenMatches: boolean;
};

const OWNER_TOKEN_ENV = "EFFECTSTREAM_ORCHESTRATOR_OWNER_TOKEN";

type OwnedProcessGroup = {
  id: number;
  ownerToken: string;
  memberStartTokens: Map<number, string>;
  proc: BunProc;
};

type OwnedGroupState =
  | { state: "empty"; members: [] }
  | { state: "owned"; members: ProcessGroupMemberIdentity[] }
  | { state: "untrusted"; members: ProcessGroupMemberIdentity[]; reason: string };

export type ProcessManagerOptions = {
  platform?: NodeJS.Platform;
  stopTimeoutMs?: number;
  inspectPorts?: (ports: number[]) => Promise<PortListener[]>;
  inspectProcessGroup?: (
    processGroupId: number,
    ownerToken: string,
  ) => ProcessGroupMemberIdentity[];
  signalProcessGroup?: (processGroupId: number, signal: StopSignal) => void;
  createOwnerToken?: () => string;
  onSignal?: (attempt: ManagedSignal) => void;
};

export class ProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private procs = new Map<string, BunProc>();
  /** POSIX groups remain recorded after a direct wrapper exits while authenticated descendants live. */
  private ownedGroups = new Map<string, OwnedProcessGroup>();
  /** Concurrent stop requests for one name share exactly one authenticated signal sequence. */
  private stopPromises = new Map<string, Promise<boolean>>();
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
  private readonly inspectProcessGroup: (
    processGroupId: number,
    ownerToken: string,
  ) => ProcessGroupMemberIdentity[];
  private readonly signalProcessGroup: (processGroupId: number, signal: StopSignal) => void;
  private readonly createOwnerToken: () => string;
  private readonly onSignal: ((attempt: ManagedSignal) => void) | undefined;

  constructor(options: ProcessManagerOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
    this.inspectConfiguredPorts = options.inspectPorts ?? inspectPorts;
    this.inspectProcessGroup = options.inspectProcessGroup
      ?? ((processGroupId, ownerToken) => this.inspectPosixProcessGroup(processGroupId, ownerToken));
    this.signalProcessGroup = options.signalProcessGroup
      ?? ((processGroupId, signal) => process.kill(-processGroupId, signal));
    this.createOwnerToken = options.createOwnerToken ?? randomUUID;
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
    const ownerToken = this.platform === "win32" ? null : this.createOwnerToken();
    if (ownerToken) childEnv[OWNER_TOKEN_ENV] = ownerToken;
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
    if (ownerToken) {
      this.ownedGroups.set(config.name, {
        id: proc.pid,
        ownerToken,
        memberStartTokens: new Map(),
        proc,
      });
    }
    this.emit(managed);

    const waitForExit = proc.exited.then((code) => {
      managed.status = code === 0 ? "done" : "failed";
      managed.exitCode = code;
      managed.endedAt = new Date();
      this.procs.delete(config.name);
      const ownedGroup = this.ownedGroups.get(config.name);
      if (ownedGroup) {
        const ownership = this.authenticateOwnedGroup(ownedGroup);
        if (ownership.state === "empty") this.ownedGroups.delete(config.name);
        if (ownership.state === "untrusted") {
          console.warn(
            `[${config.name}] Retaining no signal authority for process group ${ownedGroup.id}: ${ownership.reason}`,
          );
        }
      }
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
    const existing = this.stopPromises.get(name);
    if (existing) return existing;

    const stopping = this.stopOwned(name);
    this.stopPromises.set(name, stopping);
    try {
      return await stopping;
    } finally {
      if (this.stopPromises.get(name) === stopping) this.stopPromises.delete(name);
    }
  }

  private async stopOwned(name: string): Promise<boolean> {
    const ownedGroup = this.ownedGroups.get(name);
    const proc = this.procs.get(name) ?? ownedGroup?.proc;
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

    const term = this.signalOwned(proc, managed, ownedGroup, "SIGTERM");
    if (term === "untrusted") {
      this.finishRefusedStop(name);
      return false;
    }
    if (term === "empty") {
      this.finishStopped(name, managed);
      return true;
    }

    // A wrapper can exit while one of its descendants remains in the owned
    // POSIX group. Wait for the ownership boundary itself, not only the direct
    // child's exit promise.
    const graceful = await this.waitForOwnedExit(proc, managed, ownedGroup, this.stopTimeoutMs);

    if (graceful === "untrusted") {
      this.finishRefusedStop(name);
      return false;
    }

    if (graceful === "alive") {
      const kill = this.signalOwned(proc, managed, ownedGroup, "SIGKILL");
      if (kill === "untrusted") {
        this.finishRefusedStop(name);
        return false;
      }
      await proc.exited.catch(() => {});
      const killed = await this.waitForOwnedExit(proc, managed, ownedGroup, 1_000);
      if (killed === "untrusted") {
        this.finishRefusedStop(name);
        return false;
      }
      if (killed === "alive") {
        this.finishIncompleteStop(name, managed);
        return false;
      }
    }

    this.finishStopped(name, managed);
    return true;
  }

  private finishStopped(name: string, managed: ManagedProcess): void {
    managed.status = "stopped";
    managed.endedAt = new Date();
    this.procs.delete(name);
    this.ownedGroups.delete(name);
    this.stopping.delete(name);
    this.emit(managed);
  }

  private finishRefusedStop(name: string): void {
    this.stopping.delete(name);
    console.warn(`[${name}] Refusing to signal because the recorded native ownership identity could not be authenticated.`);
  }

  private finishIncompleteStop(name: string, managed: ManagedProcess): void {
    this.stopping.delete(name);
    console.warn(
      `[${name}] Stop incomplete: authenticated process group ${managed.processGroupId} remains live after SIGKILL; retaining ownership for a later retry.`,
    );
  }

  private signalOwned(
    proc: BunProc,
    managed: ManagedProcess,
    ownedGroup: OwnedProcessGroup | undefined,
    signal: StopSignal,
  ): "signaled" | "empty" | "untrusted" {
    if (managed.processGroupId != null) {
      if (!ownedGroup || ownedGroup.id !== managed.processGroupId) return "untrusted";
      const ownership = this.authenticateOwnedGroup(ownedGroup);
      if (ownership.state === "untrusted") {
        console.warn(
          `[${managed.name}] Refusing ${signal} for process group ${ownedGroup.id}: ${ownership.reason}`,
        );
        return "untrusted";
      }
      if (ownership.state === "empty") return "empty";
      try {
        this.signalProcessGroup(ownedGroup.id, signal);
        this.onSignal?.({
          name: managed.name,
          target: "process-group",
          id: ownedGroup.id,
          signal,
        });
      } catch (error: any) {
        if (error?.code !== "ESRCH") throw error;
      }
      return "signaled";
    }

    try {
      proc.kill(signal);
      this.onSignal?.({ name: managed.name, target: "direct-child", id: proc.pid, signal });
    } catch (error: any) {
      // An already-exited owned target makes stop idempotent. Never fall back
      // to looking up or signaling a listener by configured port.
      if (error?.code !== "ESRCH") throw error;
    }
    return "signaled";
  }

  private async waitForOwnedExit(
    proc: BunProc,
    managed: ManagedProcess,
    ownedGroup: OwnedProcessGroup | undefined,
    timeoutMs: number,
  ): Promise<"exited" | "alive" | "untrusted"> {
    if (managed.processGroupId == null) {
      return Promise.race([
        proc.exited.then(() => "exited" as const),
        Bun.sleep(timeoutMs).then(() => "alive" as const),
      ]);
    }
    if (!ownedGroup || ownedGroup.id !== managed.processGroupId) return "untrusted";

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ownership = this.authenticateOwnedGroup(ownedGroup);
      if (ownership.state === "empty") return "exited";
      if (ownership.state === "untrusted") {
        // A process that is exiting can transiently expose stat membership
        // while its environment has already disappeared. Do not signal while
        // uncertain; give disappearance one short observation window, then
        // fail closed if the same live identity is still unauthenticated.
        await Bun.sleep(Math.min(10, Math.max(1, deadline - Date.now())));
        const confirmed = this.authenticateOwnedGroup(ownedGroup);
        if (confirmed.state === "empty") return "exited";
        if (confirmed.state === "untrusted") return "untrusted";
        continue;
      }
      await Bun.sleep(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    const ownership = this.authenticateOwnedGroup(ownedGroup);
    return ownership.state === "empty"
      ? "exited"
      : ownership.state === "untrusted"
        ? "untrusted"
        : "alive";
  }

  private authenticateOwnedGroup(ownedGroup: OwnedProcessGroup): OwnedGroupState {
    let members: ProcessGroupMemberIdentity[];
    try {
      members = this.inspectProcessGroup(ownedGroup.id, ownedGroup.ownerToken)
        .filter((member) => member.processGroupId === ownedGroup.id && !member.state.startsWith("Z"));
    } catch (error: any) {
      return {
        state: "untrusted",
        members: [],
        reason: `process-group inspection failed: ${error?.message ?? error}`,
      };
    }
    if (members.length === 0) return { state: "empty", members: [] };

    for (const member of members) {
      if (!member.ownerTokenMatches || !member.startToken) {
        return {
          state: "untrusted",
          members,
          reason: `PID ${member.pid} does not carry the authenticated launch token/start identity`,
        };
      }
      const recorded = ownedGroup.memberStartTokens.get(member.pid);
      if (recorded !== undefined && recorded !== member.startToken) {
        return {
          state: "untrusted",
          members,
          reason: `PID ${member.pid} start identity changed from ${recorded} to ${member.startToken}`,
        };
      }
    }
    for (const member of members) {
      ownedGroup.memberStartTokens.set(member.pid, member.startToken);
    }
    return { state: "owned", members };
  }

  private inspectPosixProcessGroup(
    processGroupId: number,
    ownerToken: string,
  ): ProcessGroupMemberIdentity[] {
    if (this.platform === "linux") {
      try {
        return fs.readdirSync("/proc", { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
          .flatMap((entry): ProcessGroupMemberIdentity[] => {
            const pid = Number(entry.name);
            let state = "?";
            let group = -1;
            let startToken = "";
            try {
              const stat = fs.readFileSync(`/proc/${entry.name}/stat`, "utf8");
              const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
              state = fields[0];
              group = Number(fields[2]);
              if (group !== processGroupId || state === "Z") return [];
              startToken = fields[19] ?? "";
              const environ = fs.readFileSync(`/proc/${entry.name}/environ`, "utf8");
              const member = {
                pid,
                processGroupId: group,
                state,
                startToken,
                ownerTokenMatches: environ
                  .split("\0")
                  .includes(`${OWNER_TOKEN_ENV}=${ownerToken}`),
              };
              if (member.ownerTokenMatches) return [member];

              // A successful environ read can still be transiently empty as
              // a process exits. Re-sample stat and environ before returning
              // a stable live token mismatch to the fail-closed boundary.
              const latest = fs.readFileSync(`/proc/${entry.name}/stat`, "utf8");
              const latestFields = latest.slice(latest.lastIndexOf(")") + 2).split(" ");
              const latestState = latestFields[0];
              const latestGroup = Number(latestFields[2]);
              if (latestGroup !== processGroupId || latestState === "Z") return [];
              const latestEnvironment = fs.readFileSync(`/proc/${entry.name}/environ`, "utf8");
              return [{
                pid,
                processGroupId: latestGroup,
                state: latestState,
                startToken: latestFields[19] ?? startToken,
                ownerTokenMatches: latestEnvironment
                  .split("\0")
                  .includes(`${OWNER_TOKEN_ENV}=${ownerToken}`),
              }];
            } catch {
              // A member can exit between reading stat and environ. Re-sample
              // its stat before treating an unreadable identity as a live,
              // untrusted member; disappearance or group departure is safe.
              try {
                const latest = fs.readFileSync(`/proc/${entry.name}/stat`, "utf8");
                const latestFields = latest.slice(latest.lastIndexOf(")") + 2).split(" ");
                const latestState = latestFields[0];
                const latestGroup = Number(latestFields[2]);
                if (latestGroup !== processGroupId || latestState === "Z") return [];
                return [{
                  pid,
                  processGroupId: latestGroup,
                  state: latestState,
                  startToken: latestFields[19] ?? startToken,
                  ownerTokenMatches: false,
                }];
              } catch {
                return [];
              }
            }
          });
      } catch {
        // Fall through to the portable ps view on restricted procfs mounts.
      }
    }

    const result = Bun.spawnSync(["ps", "-axo", "pid=,pgid=,stat=,lstart="], { stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error("ps could not inspect process-group identities");
    return result.stdout
      .toString()
      .split("\n")
      .flatMap((line): ProcessGroupMemberIdentity[] => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
        if (!match || Number(match[2]) !== processGroupId || match[3].startsWith("Z")) return [];
        const pid = Number(match[1]);
        const environment = Bun.spawnSync(
          ["ps", "eww", "-p", String(pid), "-o", "command="],
          { stderr: "pipe" },
        );
        return [{
          pid,
          processGroupId,
          state: match[3],
          startToken: match[4].trim(),
          ownerTokenMatches: environment.exitCode === 0
            && environment.stdout.toString().includes(`${OWNER_TOKEN_ENV}=${ownerToken}`),
        }];
      });
  }

  /** Stops and re-launches a process. Returns null if the process was never started. */
  async restart(name: string): Promise<{ waitForExit: Promise<number> } | null> {
    const managed = this.processes.get(name);
    if (!managed) return null;
    const stopped = await this.stop(name);
    if (!stopped && this.isRunning(name)) {
      throw new Error(
        `Refusing to restart ${name}: the prior process-group identity could not be authenticated`,
      );
    }
    return this.launch(managed.config);
  }

  /** Stops all running processes in parallel. */
  async stopAll(): Promise<void> {
    const names = new Set([...this.procs.keys(), ...this.ownedGroups.keys()]);
    await Promise.all(Array.from(names).map((n) => this.stop(n)));
  }

  isRunning(name: string): boolean {
    return this.procs.has(name) || this.ownedGroups.has(name);
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
