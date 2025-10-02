// This is a wrapper around the tmux command.
// It allows to create an instance of tmux, and execute commands on it.
import { ENV } from "@paima/utils/node-env";

// TODO: Use `with { type: "text" }` when it no longer requires `--unstable-raw-imports`.
// https://github.com/denoland/deno/issues/29904
import install_sh from "./install.sh.ts";
import tmux_launch_json from "./tmux.launch.json.ts";

export interface TmuxOptions {
  /**
   * The command to use. Defaults to "tmux"
   */
  command: string;

  /**
   * The path to the tmux configuration file
   */
  configFile?: string;
}

/* Deny shell escapes and tmux command sequence escapes from session names as a precaution. */
const NAME_FORMAT = /^[^"';]+$/;

/**
 * An adapter class containing methods to execute common
 * tmux operations.
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
  private paneCount: number = 0;

  constructor(options: Partial<TmuxOptions>) {
    this.options = {
      command: "tmux",
      ...options,
    };
  }

  async init() {
    let path = import.meta.dirname + "/tmux.conf";
    let cleanup = false;
    try {
      await Deno.stat(path);
    } catch (e) {
      // create file
      path = "./tmux.conf";
      cleanup = true;
      await Deno.writeTextFile(path, `set -g mouse on`);
    }

    this.options.configFile = path;
  }

  /**
   * Create a new session of the given name
   *
   * @param name Session name
   * @param command Optional command to execute
   */
  public async newSession(name: string, command?: string[]): Promise<void> {
    if (await this.hasSession(name)) {
      throw new Error(`Session '${name}' already exists`);
    }

    const ext = command ?? [];
    // Build the base command with config file if specified
    const cfg = this.options.configFile ? ["-f", this.options.configFile] : [];
    const cmd = [
      ...cfg,
      "new",
      "-d",
      "-e",
      `ORCHESTRATOR_PORT=${ENV.ORCHESTRATOR_PORT}`,
      "-s",
      name,
      ...ext,
    ];
    console.log("tmux", ...cmd);
    await this._exec(cmd);
  }

  /**
   * List of sessions currently active
   */
  public async listSessions(): Promise<string[]> {
    const out = await this._exec(["ls", "-F", "#S"], true);
    if (!out) return [];
    return out.split("\n").filter((s) => !!s);
  }

  /**
   * Returns whether a session with the given name exists
   *
   * @param name Session to check
   */
  public async hasSession(name: string): Promise<boolean> {
    this._validateSessionName(name);

    try {
      await this._exec(["has-session", "-t", name]);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Write text input to a specific pane in the given session
   *
   * @param sessionName Session name
   * @param paneIndex Pane index (0 = first pane, 1 = second pane, etc.)
   * @param print Text to write
   * @param newline Whether to end with an enter (Execute input). Defaults to false
   */
  public async writeInputToPane(
    sessionName: string,
    paneIndex: number,
    print: string,
    newline: boolean = false,
  ): Promise<void> {
    if (!(await this.hasSession(sessionName))) {
      throw new Error(`Session '${sessionName}' does not exist`);
    }

    const ext = newline ? ["Enter"] : [];
    const target = `${sessionName}:0.${paneIndex}`; // session:window.pane

    await this._exec(["send-keys", "-t", target, print, ...ext]);
  }

  public getAttachSessionCommand(
    name: string,
  ): { command: string; args: string[] } {
    const args: string[] = [];
    args.push("attach-session", "-t", name);
    return {
      command: this.options.command!,
      args: args,
    };
  }

  /**
   * Split a pane in the given session
   *
   * @param sessionName Session name
   * @param horizontal If true, split horizontally (left/right). If false, split vertically (top/bottom). Defaults to true
   * @param command Optional command to execute in the new pane
   */
  public async splitPane(
    sessionName: string,
    horizontal: boolean = true,
    command?: string,
  ): Promise<void> {
    if (!(await this.hasSession(sessionName))) {
      throw new Error(`Session '${sessionName}' does not exist`);
    }

    const cmd = ["split-window", "-t", sessionName, horizontal ? "-h" : "-v"];
    await this._exec(cmd);

    this.paneCount++;
    if (command) {
      await this.writeInputToPane(sessionName, this.paneCount, command, true);
    }
  }

  /**
   * @param args Arguments to pass to `tmux`.
   */
  private async _exec(
    args: string[],
    ignoreError: boolean = false,
  ): Promise<string> {
    try {
      const cmd = new Deno.Command(this.options.command, {
        args,
        stdout: "piped",
        stderr: "piped",
      });

      const output = await cmd.output();

      if (!output.success && !ignoreError) {
        const errorText = new TextDecoder().decode(output.stderr);
        throw new Error(
          errorText || `Command failed with exit code ${output.code}`,
        );
      }

      return new TextDecoder().decode(output.stdout);
    } catch (error) {
      if (ignoreError) {
        return "";
      }
      throw error;
    }
  }

  /**
   * Validate the given session name
   *
   * @param name Session name
   */
  private _validateSessionName(name: string) {
    if (!NAME_FORMAT.test(name) || name.length > 50) {
      throw new Error(`Illegal session name`);
    }
  }

  public async readLaunchJson(
    packageName: string,
    sessionName: string,
    file?: string,
  ) {
    const data: {
      panes: {
        command?: string;
        name: string;
        split_horizontal?: boolean;
        split_vertical?: boolean;
      }[];
    } = tmux_launch_json;

    for (const pane of data.panes) {
      pane.command = pane.command?.replaceAll("${packageName}", packageName);
    }

    for (const pane of data.panes) {
      if (pane.split_horizontal) {
        await this.splitPane(sessionName, true, pane.command);
      } else if (pane.split_vertical) {
        await this.splitPane(sessionName, false, pane.command);
      } else if (pane.command) {
        await this.writeInputToPane(sessionName, 0, pane.command, true);
      }
    }
  }
}
