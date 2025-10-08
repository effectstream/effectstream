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
import install_sh from "./install.sh.ts";
import session_tmux from "./session.tmux.ts";

export interface TmuxOptions {
  /**
   * The command to use. Defaults to "tmux"
   */
  command: string;

  /**
   * The socket alias to use. Defaults to `paima-${Date.now()}`.
   */
  socket: string;
}

/**
 * A controller for a private tmux server for the orchestrator's use.
 */
export class Tmux {
  static async install() {
    // Pipe the built-in `install.sh` to `sh` directly.
    const cmd = new Deno.Command("sh", {
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });
    const child = cmd.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(install_sh));
    await writer.close();
    const output = await child.output();

    if (output.stdout.length > 0) {
      console.log(new TextDecoder().decode(output.stdout));
    }
    if (output.stderr.length > 0) {
      console.log(new TextDecoder().decode(output.stderr));
    }

    if (!output.success) {
      console.error("Error running install.sh: exit code", output.code);
    }
  }

  private options: TmuxOptions;

  constructor(options: Partial<TmuxOptions> = {}) {
    this.options = {
      command: "tmux",
      socket: `paima-${Date.now()}`,
      ...options,
    };
  }

  /** Tell the server to start our session. */
  public async startSession() {
    const cmd = new Deno.Command(this.options.command, {
      args: [
        "-L",
        this.options.socket,
        "start-server",
        ";",
        "source-file",
        "-",
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const child = cmd.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(session_tmux));
    await writer.close();
    this._checkExit(await child.output());
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
    const cmd = new Deno.Command(this.options.command, {
      args: ["-L", this.options.socket, "-N", "kill-server"],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    });
    // Ignore exit status. We're okay with failing to kill something that isn't there.
    await cmd.output();
  }

  private _checkExit(output: Deno.CommandOutput) {
    if (!output.success) {
      const errorText = new TextDecoder().decode(output.stderr);
      throw new Error(
        errorText || `Command failed with exit code ${output.code}`,
      );
    }
  }
}
