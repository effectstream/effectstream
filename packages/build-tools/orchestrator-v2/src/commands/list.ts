import type { ParsedArgs } from "../cli.ts";
import { logError } from "../display.ts";
import { loadConfig, findDefaultConfig, findPackageJsonConfig } from "../load-config.ts";
import { readStateConfigPath } from "../port-check.ts";

type ListOptions = Pick<ParsedArgs, "positionals" | "flags">;

export async function runListCommand(opts: ListOptions): Promise<void> {
  const configPath =
    (opts.flags["config"] as string | undefined) ??
    opts.positionals[0] ??
    readStateConfigPath() ??
    (await findPackageJsonConfig()) ??
    (await findDefaultConfig());

  if (!configPath) {
    logError("(3) No config file found. Pass one as an argument or create orchestrator.config.ts.");
    process.exit(1);
  }

  let config;
  try {
    config = await loadConfig(configPath);
  } catch (err: any) {
    logError(err.message);
    process.exit(1);
  }

  const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    green: "\x1b[32m",
  };

  console.log(`${c.bold}Processes in ${configPath}${c.reset}\n`);

  for (const p of config.processes) {
    const ports = p.stopProcessAtPort?.join(", ") ?? "";
    const deps = (p.dependsOn ?? []).join(", ");
    const cmd = `${p.command ?? "bun"} ${p.args.join(" ")}`;
    const wait = p.waitToExit ? "wait-to-exit" : "background";
    const crit = p.critical === false
      ? `${c.dim}non-critical${c.reset}`
      : `${c.dim}critical${c.reset}`;

    console.log(`  ${c.bold}${c.cyan}${p.name}${c.reset}`);
    if (p.description) {
      console.log(`    ${c.dim}${p.description}${c.reset}`);
    }
    console.log(`    cmd:   ${c.dim}${cmd}${c.reset}`);
    if (ports) console.log(`    ports: ${ports}`);
    if (deps)  console.log(`    deps:  ${deps}`);
    const manual = p.autoStart === false ? `  ${c.dim}manual${c.reset}` : "";
    console.log(`    mode:  ${wait}  ${crit}${manual}`);
    if (p.link) console.log(`    link:  ${c.green}${p.link}${c.reset}`);
    console.log();
  }

  console.log(`${c.dim}Total: ${config.processes.length} process(es)${c.reset}`);
}
