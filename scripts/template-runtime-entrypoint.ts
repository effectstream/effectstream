#!/usr/bin/env bun

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface RuntimeManifest {
  schemaVersion: number;
  effectstreamVersion: string;
  templateBaselineVersion: string;
  releaseSha: string;
  platform: string;
  templates: { name: string; lockSha256: string }[];
}

const DEFAULT_ROOT = "/opt/effectstream";

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function readRuntimeManifest(root = DEFAULT_ROOT): RuntimeManifest {
  return JSON.parse(fs.readFileSync(path.join(root, "runtime-manifest.json"), "utf8"));
}

export function embeddedTemplate(
  name: string,
  manifest: RuntimeManifest,
): RuntimeManifest["templates"][number] {
  const template = manifest.templates.find((candidate) => candidate.name === name);
  if (!template) {
    throw new Error(
      `unknown template ${JSON.stringify(name)}; available: ${manifest.templates.map((item) => item.name).join(", ")}`,
    );
  }
  return template;
}

function directoryIsEmpty(directory: string): boolean {
  return !fs.existsSync(directory) || fs.readdirSync(directory).length === 0;
}

function writeTemplateMarker(
  destination: string,
  name: string,
  lockSha256: string,
  manifest: RuntimeManifest,
): void {
  fs.writeFileSync(
    path.join(destination, ".effectstream-template.json"),
    `${JSON.stringify({
      name,
      effectstreamVersion: manifest.effectstreamVersion,
      templateBaselineVersion: manifest.templateBaselineVersion,
      releaseSha: manifest.releaseSha,
      lockSha256,
    }, null, 2)}\n`,
  );
}

export function removeWorkspaceVolumeSeed(workspace: string): void {
  const volumeSeed = path.join(workspace, ".effectstream-volume");
  if (fs.existsSync(volumeSeed)) fs.rmSync(volumeSeed);
}

export function prepareYaciHome(options: {
  runtimeRoot?: string;
  home: string;
  platform?: string;
}): string {
  const runtimeRoot = options.runtimeRoot ?? DEFAULT_ROOT;
  const platform = options.platform ?? "linux-amd64";
  const source = path.join(
    runtimeRoot,
    "cache",
    "binaries",
    "cardano-node",
    "10.1.4",
    platform,
  );
  if (!fs.existsSync(path.join(source, "bin", "cardano-node"))) return "";
  const yaciHome = path.join(options.home, ".yaci-cli");
  fs.mkdirSync(yaciHome, { recursive: true });
  for (const [name, target] of [
    ["cardano-node", source],
    ["bin", path.join(source, "bin")],
    ["share", path.join(source, "share")],
  ]) {
    const destination = path.join(yaciHome, name);
    if (!fs.existsSync(destination)) fs.symlinkSync(target, destination, "dir");
  }
  return yaciHome;
}

export function prepareSolanaHome(options: {
  runtimeRoot?: string;
  home: string;
}): string {
  const runtimeRoot = options.runtimeRoot ?? DEFAULT_ROOT;
  const source = path.join(runtimeRoot, "cache", "solana-platform-tools", "v1.52");
  if (!fs.existsSync(path.join(source, "rust", "bin", "rustc"))) return "";
  const versionHome = path.join(options.home, ".cache", "solana", "v1.52");
  fs.mkdirSync(versionHome, { recursive: true });
  const destination = path.join(versionHome, "platform-tools");
  if (!fs.existsSync(destination)) fs.symlinkSync(source, destination, "dir");
  return destination;
}

export function materializeTemplate(options: {
  name: string;
  destination: string;
  runtimeRoot?: string;
  force?: boolean;
}): string {
  const runtimeRoot = options.runtimeRoot ?? DEFAULT_ROOT;
  const manifest = readRuntimeManifest(runtimeRoot);
  const template = embeddedTemplate(options.name, manifest);
  const source = path.join(runtimeRoot, "templates", options.name);
  const dependencies = path.join(runtimeRoot, "template-deps", options.name);
  const destination = path.resolve(options.destination);
  if (!fs.existsSync(source) || !fs.existsSync(dependencies)) {
    throw new Error(`embedded template payload is incomplete for ${options.name}`);
  }
  if (!directoryIsEmpty(destination)) {
    const marker = path.join(destination, ".effectstream-template.json");
    if (!options.force && fs.existsSync(marker)) {
      const current = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (current.name === options.name && current.lockSha256 === template.lockSha256) {
        // The template baseline can stay unchanged across several npm/image
        // releases. Preserve local files but refresh image provenance metadata.
        writeTemplateMarker(destination, options.name, template.lockSha256, manifest);
        return destination;
      }
    }
    if (!options.force) {
      throw new Error(`${destination} is not empty; pass --force to replace its contents`);
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  fs.cpSync(dependencies, path.join(destination, "node_modules"), { recursive: true });
  const lock = path.join(destination, "bun.lock");
  const actual = sha256File(lock);
  if (actual !== template.lockSha256) {
    throw new Error(`embedded lock digest mismatch for ${options.name}: ${actual}`);
  }
  writeTemplateMarker(destination, options.name, template.lockSha256, manifest);
  return destination;
}

function usage(manifest: RuntimeManifest): string {
  return `EffectStream template runtime ${manifest.effectstreamVersion} (${manifest.platform})
Embedded template baseline: EffectStream ${manifest.templateBaselineVersion}

Usage:
  template-runtime list
  template-runtime create <template> [destination] [--force]
  template-runtime test <template> [-- <args...>]
  template-runtime dev <template> [-- <args...>]
  template-runtime run <template> -- <command...>
  template-runtime shell <template>

The exact release template and installed dependency tree are copied into a
writable workspace. Native binaries remain in the shared read-only cache;
generated chain state is written below EFFECTSTREAM_RUNTIME_DIR.

Templates: ${manifest.templates.map((template) => template.name).join(", ")}`;
}

async function runCommand(command: string[], cwd: string): Promise<number> {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...process.env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return child.exited;
}

async function main(): Promise<void> {
  const runtimeRoot = process.env.EFFECTSTREAM_HOME ?? DEFAULT_ROOT;
  const manifest = readRuntimeManifest(runtimeRoot);
  // A non-empty mountpoint makes Docker preserve UID/GID 10001 when it
  // initializes a named volume from /workspace. Remove the seed before normal
  // empty-directory validation; it is not part of a materialized template.
  const workspace = process.env.EFFECTSTREAM_WORKSPACE ?? "/workspace";
  removeWorkspaceVolumeSeed(workspace);
  prepareYaciHome({
    runtimeRoot,
    home: process.env.HOME ?? "/home/effectstream",
    platform: manifest.platform,
  });
  prepareSolanaHome({
    runtimeRoot,
    home: process.env.HOME ?? "/home/effectstream",
  });
  const args = process.argv.slice(2);
  const action = args.shift() ?? "help";
  if (action === "help" || action === "--help" || action === "-h") {
    console.log(usage(manifest));
    return;
  }
  if (action === "list") {
    for (const template of manifest.templates) console.log(template.name);
    return;
  }
  const name = args.shift();
  if (!name) throw new Error(`${action} requires a template name`);
  embeddedTemplate(name, manifest);
  const forceIndex = args.indexOf("--force");
  const force = forceIndex !== -1;
  if (force) args.splice(forceIndex, 1);
  const separator = args.indexOf("--");
  if (separator !== -1) args.splice(separator, 1);
  if (action === "create") {
    const destination = args.shift() ?? `/workspace/${name}`;
    console.log(materializeTemplate({ name, destination, runtimeRoot, force }));
    return;
  }
  const destination = workspace;
  const cwd = materializeTemplate({ name, destination, runtimeRoot, force });
  let command: string[];
  if (action === "test") command = ["bun", "run", "test", ...args];
  else if (action === "dev") command = ["bun", "run", "dev", ...args];
  else if (action === "shell") command = ["/bin/bash"];
  else if (action === "run") {
    if (args.length === 0) throw new Error("run requires a command after --");
    command = args;
  } else throw new Error(`unknown action ${JSON.stringify(action)}`);
  process.exitCode = await runCommand(command, cwd);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
