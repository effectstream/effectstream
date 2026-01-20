/*
  Tmux server controller. Flow:
  1. Install tmux
  2. Start a tmux server and session by feeding it our startup script
  3. Attach to the tmux session in the foreground
  4. Wait for the tmux session to exit (^C for kill-session, or detach)
  5. Orchestrator shuts down, killing tmux server on the way

  A distinct server is used so that:
  - The environment variables of the orchestrator are respected.
  - The user's tmux keybinds (like changing the prefix) are respected.
  - We can set our own keybinds (like ^C to kill the session) that don't affect
    other sessions (keybinds are always per-server).
  - We can reliably kill the server and therefore the session no matter why the
    `tmux attach` command ended (detached, killed session, killed externally).

  It would be nice to run `tmux -D` as one of the orchestrator's processes, but
  we can't easily detect when after spawning it the socket is ready and we can
  run other commands, so we let tmux handle spawning the server itself and
  expose `.kill()` separately.

  We don't have any cleanup logic for the socket file at present, but tmux
  should put it in `/tmp` or similar.
*/

// TODO: Use `with { type: "text" }` when it no longer requires `--unstable-raw-imports`.
// https://github.com/denoland/deno/issues/29904
import { spawn } from "node:child_process";
import install_sh from "./install.sh.ts";
import session_tmux from "./session.tmux.ts";

export interface TmuxOptions {
  /**
   * The command to use. Defaults to "tmux"
   */
  command: string;

  /**
   * The socket alias to use. Defaults to `effectstream-${Date.now()}`.
   */
  socket: string;
}

/**
 * A controller for a private tmux server for the orchestrator's use.
 */
export class Tmux {
  static async install() {
    const output = await runCommand("sh", [], install_sh);
    if (output.stdout) {
      console.log(output.stdout);
    }
    if (output.stderr) {
      console.log(output.stderr);
    }
    if (!output.success) {
      console.error("Error running install.sh: exit code", output.code);
    }
  }

  private options: TmuxOptions;

  constructor(options: Partial<TmuxOptions> = {}) {
    this.options = {
      command: "tmux",
      socket: `effectstream-${Date.now()}`,
      ...options,
    };
  }

  /** Tell the server to start our session. */
  public async startSession() {
    const output = await runCommand(
      this.options.command,
      [
        "-L",
        this.options.socket,
        "start-server",
        ";",
        "source-file",
        "-",
      ],
      session_tmux,
    );
    this._checkExit(output);
  }

  /** Attach to the session in the foreground and wait for it to be detached. */
  public getAttachCommand(): {
    command: string;
    args: string[];
    stdin: "inherit";
    stdout: "inherit";
    stderr: "inherit";
  } {
    return {
      command: this.options.command,
      args: ["-L", this.options.socket, "-N", "attach"],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    };
  }

  /** Kill the server, if it hasn't already exited. */
  public async killServer() {
    await runCommand(this.options.command, [
      "-L",
      this.options.socket,
      "-N",
      "kill-server",
    ]);
  }

  private _checkExit(output: CommandOutput) {
    if (!output.success) {
      const errorText = output.stderr ?? "";
      throw new Error(
        errorText || `Command failed with exit code ${output.code}`,
      );
    }
  }
}

type CommandOutput = {
  success: boolean;
  code: number | null;
  stdout?: string;
  stderr?: string;
};

const runCommand = async (
  command: string,
  args: string[],
  stdin?: string,
): Promise<CommandOutput> => {
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (stdin) {
    child.stdin?.write(stdin);
  }
  child.stdin?.end();

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode));
  });

  return {
    success: code === 0,
    code,
    stdout: stdoutChunks.length ? Buffer.concat(stdoutChunks).toString() : "",
    stderr: stderrChunks.length ? Buffer.concat(stderrChunks).toString() : "",
  };
};
