/**
 * Configuration types for orchestrator.
 *
 * ProcessConfig is intentionally compatible with the v1 ProcessLaunch schema
 * so existing launch-*.ts scripts can be reused with minor changes.
 */
export type ProcessConfig = {
  /** Unique name for this process. */
  name: string;
  /** Human-readable description (shown in status output). */
  description?: string;
  /**
   * Executable to run. Defaults to "bun".
   * Use "deno" for legacy deno-task-based processes.
   */
  command?: string;
  /** Arguments passed to the command. */
  args: string[];
  /** Names of processes that must complete/start before this one. */
  dependsOn?: string[];
  /**
   * If set, launch fails when any port is already occupied. The orchestrator
   * never treats a configured port as permission to signal its listener.
   * Also used by the `status` command for port-based liveness detection.
   */
  stopProcessAtPort?: number[];
  /**
   * If true, dependents wait for this process to EXIT before starting.
   * If false (default), dependents start as soon as this process is launched.
   */
  waitToExit?: boolean;
  /**
   * system-dependency: a core service (e.g. a chain node); failure triggers shutdown.
   * secondary: optional service; failure is logged but orchestrator keeps running.
   * Defaults to "system-dependency".
   */
  type?: "system-dependency" | "secondary";
  /** Extra environment variables for the process. */
  env?: Record<string, string>;
  /** Working directory for the process. Defaults to process.cwd(). */
  cwd?: string;
  /**
   * If true (default), a non-zero exit code triggers a full shutdown.
   * If false, the failure is reported but the orchestrator keeps running.
   */
  critical?: boolean;
  /** Optional URL shown in status output (e.g. a UI endpoint). */
  link?: string;
  /**
   * If false, this process is skipped during a normal `start` and only runs
   * when explicitly requested via `--only`. Useful for one-off tasks like
   * contract compilation that aren't part of the default startup flow.
   * Defaults to true.
   */
  autoStart?: boolean;
};

export type OrchestratorConfig = {
  /** Ordered list of processes to manage. */
  processes: ProcessConfig[];
  /**
   * Port for the orchestrator HTTP API used by status/restart/stop commands.
   * Defaults to 4747. Overrideable with --port CLI flag.
   */
  apiPort?: number;
};
