import * as path from "path";
import type { OrchestratorConfig } from "./config.ts";
import { logWarn } from "./display.ts";

/**
 * Loads an OrchestratorConfig from a TypeScript or JSON file.
 * Handles both absolute paths and paths relative to process.cwd().
 */
export async function loadConfig(filePath: string): Promise<OrchestratorConfig> {
  // Ensure the path is absolute so `import()` works reliably
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const mod = await import(abs);
  const cfg: OrchestratorConfig = mod.default ?? mod;

  if (!Array.isArray(cfg.processes)) {
    throw new Error(
      `Config file "${filePath}" must export an OrchestratorConfig with a "processes" array.`,
    );
  }

  // The "sync" process is the main Effectstream sync engine. Warn if missing.
  const hasSync = cfg.processes.some((p) => p.name === "sync");
  if (!hasSync) {
    logWarn(
      `No "sync" process defined in config. ` +
      `Add a process named "sync" (e.g. args: ["run", "node:start"]) to start the Effectstream sync engine.`,
    );
  }

  return cfg;
}

/** Returns the path to the first default config file found, or null. */
export async function findDefaultConfig(): Promise<string | null> {
  const candidates = [
    "orchestrator.config.ts",
    "orchestrator.config.js",
    "orchestrator.config.json",
  ];
  for (const name of candidates) {
    const abs = path.resolve(process.cwd(), name);
    if (await Bun.file(abs).exists()) return abs;
  }
  return null;
}

/** Checks package.json in cwd for an `effectstream.default` config path. */
export async function findPackageJsonConfig(): Promise<string | null> {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const content = await Bun.file(pkgPath).text();
    const pkg = JSON.parse(content);
    const configRel = pkg?.effectstream?.default;
    if (typeof configRel === "string") {
      return path.resolve(process.cwd(), configRel);
    }
  } catch {
    // no package.json or invalid JSON
  }
  return null;
}
