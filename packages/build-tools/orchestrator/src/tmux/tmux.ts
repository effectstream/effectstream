import { ENV } from "@paima/utils";

// use --unstable-raw-imports
// https://github.com/denoland/deno/issues/29904
// import launchJson from "./tmux.launch.json" with { type: "text" };

import { json } from "./tmux.launch.ts";
import { install } from "./install.ts";

// dirname is not available in jsr packages
const __dirname = import.meta.dirname;

// This is a wrapper around the tmux command.
// It allows to create an instance of tmux, and execute commands on it.

export default interface NodeTmuxOptions {
  /**
   * The path of the shell to use
   */
  shell?: string;

  /**
   * The command to use. Defaults to "tmux"
   */
  command?: string;

  /**
   * The path to the tmux configuration file
   */
  configFile?: string;
}

/* The format prevents  */
const NAME_FORMAT = /^[^"';]+$/;

/**
 * An adapter class containing methods to execute common
 * tmux operations.
 */
export class Tmux {
  private options: NodeTmuxOptions;
  private paneCount: number = 0;

  constructor(options: NodeTmuxOptions) {
    this.options = {
      command: "tmux",
      shell: ENV.SHELL,
      ...options,
    };
  }
  async init() {
    const path = __dirname ? __dirname + "/tmux.conf" : "./tmux.conf";
    try {
      await Deno.stat(path);
    } catch (e) {
      // create file
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
  public async newSession(name: string, command?: string): Promise<void> {
    if (!this._validate(name) || name.length > 50) {
      throw new Error(`Illegal session name`);
    } else if (await this.hasSession(name)) {
      throw new Error(`Session '${name}' already exists`);
    }

    const ext = command ? ` ${command}` : "";
    // Build the base command with config file if specified
    let tmuxCommand = this.options.command!;
    if (this.options.configFile) {
      tmuxCommand += ` -f "${this.options.configFile}"`;
    }

    const cmd = `${tmuxCommand} new -d -s "${name}"` + ext;
    console.log(cmd);
    await this._exec(cmd);
  }

  /**
   * List of sessions currently active
   */
  public async listSessions(): Promise<string[]> {
    const out = await this._exec(`${this.options.command} ls -F "#S"`, true);
    if (!out) return [];
    return out.split("\n").filter((s) => !!s);
  }

  /**
   * Returns whether a session with the given name exists
   *
   * @param name Session to check
   */
  public async hasSession(name: string): Promise<boolean> {
    if (!this._validate(name) || name.length > 50) {
      throw new Error(`Illegal session name`);
    }

    try {
      await this._exec(`${this.options.command} has-session -t "${name}"`);
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
    if (!this._validate(sessionName) || sessionName.length > 50) {
      throw new Error(`Illegal session name`);
    } else if (!(await this.hasSession(sessionName))) {
      throw new Error(`Session '${sessionName}' does not exist`);
    }

    const ext = newline ? " Enter" : "";
    const target = `${sessionName}:0.${paneIndex}`; // session:window.pane

    await this._exec(
      `${this.options.command} send-keys -t "${target}" "${print}"` + ext,
    );
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
    if (!this._validate(sessionName) || sessionName.length > 50) {
      throw new Error(`Illegal session name`);
    } else if (!(await this.hasSession(sessionName))) {
      throw new Error(`Session '${sessionName}' does not exist`);
    }

    let cmd = `${this.options.command} split-window -t "${sessionName}"`;

    if (horizontal) {
      cmd += ` -h`; // horizontal split (left/right)
    } else {
      cmd += ` -v`; // vertical split (top/bottom)
    }
    await this._exec(cmd);

    this.paneCount++;
    if (command) {
      await this.writeInputToPane(sessionName, this.paneCount, command, true);
    }
  }

  /**
   * Command Execution utility method
   *
   * @param command Command to execute
   */
  private async _exec(
    command: string,
    ignoreError: boolean = false,
  ): Promise<string> {
    try {
      const cmd = new Deno.Command("sh", {
        args: ["-c", command],
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
  private _validate(name: string) {
    return NAME_FORMAT.test(name);
  }

  public async readLaunchJson(sessionName: string, file?: string) {
    const data: {
      panes: {
        command?: string;
        name: string;
        split_horizontal?: boolean;
        split_vertical?: boolean;
      }[];
    } = json;
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

export const installTmux = async () => {
  const path = __dirname ? __dirname + "/install.sh" : "./install.sh";
  try {
    await Deno.stat(path);
  } catch (e) {
    // create file
    await Deno.writeTextFile(path, install);
  }

  const cmd = new Deno.Command("sh", {
    args: [path],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();

  if (output.stdout.length > 0) {
    console.log(new TextDecoder().decode(output.stdout));
  }
  if (output.stderr.length > 0) {
    console.log(new TextDecoder().decode(output.stderr));
  }

  if (!output.success) {
    console.error("Error running install.sh: exit code", output.code);
  }
};
