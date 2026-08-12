#!/usr/bin/env bun

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ENABLED_TEMPLATES } from "../templates/enabled.ts";

const ROOT = path.resolve(import.meta.dir, "..");

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function flagValue(name: string): string | undefined {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export interface EmbeddedTemplate {
  name: string;
  lockSha256: string;
}

function bunPackageRoots(
  templateRoot: string,
  storePrefix: string,
  packagePath: string[],
): string[] {
  const bunStore = path.join(templateRoot, "node_modules", ".bun");
  return fs.existsSync(bunStore)
    ? fs.readdirSync(bunStore)
      .filter((entry) => entry.startsWith(storePrefix))
      .map((entry) => path.join(bunStore, entry, "node_modules", ...packagePath))
      .filter((entry) => fs.existsSync(path.join(entry, "package.json")))
    : [];
}

export function linkDolosBinary(
  templateRoot: string,
  outputRoot: string,
  platform: string,
): number {
  const sharedBinary = path.join(
    outputRoot,
    "cache",
    "binaries",
    "dolos",
    "1.2.0",
    platform,
    "bin",
    "dolos",
  );
  const packages = bunPackageRoots(
    templateRoot,
    "@txpipe+dolos@",
    ["@txpipe", "dolos"],
  );
  if (packages.length > 0 && !fs.existsSync(sharedBinary)) {
    throw new Error(`shared Dolos binary is missing: ${sharedBinary}`);
  }
  for (const packageRoot of packages) {
    const installDirectory = path.join(packageRoot, "node_modules", ".bin_real");
    const destination = path.join(installDirectory, "dolos");
    fs.rmSync(installDirectory, { recursive: true, force: true });
    fs.mkdirSync(installDirectory, { recursive: true });
    fs.symlinkSync(sharedBinary, destination);
  }
  return packages.length;
}

export function linkLegacyBinaryCaches(
  templateRoot: string,
  outputRoot: string,
  platform: string,
): number {
  const mappings = [
    {
      storePrefix: "@effectstream+npm-midnight-node@",
      packagePath: ["@effectstream", "npm-midnight-node"],
      id: "midnight-node",
      version: "1.0.0",
      executable: "midnight-node",
      legacyPath: ["midnight-node", "midnight-node"],
      linkDirectory: false,
    },
    {
      storePrefix: "@effectstream+npm-midnight-indexer@",
      packagePath: ["@effectstream", "npm-midnight-indexer"],
      id: "midnight-indexer",
      version: "v4.3.3",
      executable: "indexer-standalone",
      legacyPath: ["indexer-standalone", "indexer-standalone"],
      linkDirectory: false,
    },
    {
      storePrefix: "@effectstream+npm-midnight-proof-server@",
      packagePath: ["@effectstream", "npm-midnight-proof-server"],
      id: "midnight-proof-server",
      version: "ledger-8.1.0",
      executable: "midnight-proof-server",
      legacyPath: ["proof-server", "midnight-proof-server"],
      linkDirectory: false,
    },
    {
      storePrefix: "@effectstream+bitcoin-core@",
      packagePath: ["@effectstream", "bitcoin-core"],
      id: "bitcoin-core",
      version: "28.1",
      executable: "bitcoind",
      legacyPath: ["vendor"],
      linkDirectory: true,
    },
    {
      storePrefix: "@effectstream+solana-node@",
      packagePath: ["@effectstream", "solana-node"],
      id: "solana-node",
      version: "3.0.14",
      executable: "solana-test-validator",
      legacyPath: ["vendor"],
      linkDirectory: true,
    },
  ] as const;
  let linked = 0;
  for (const mapping of mappings) {
    const sharedRoot = path.join(
      outputRoot,
      "cache",
      "binaries",
      mapping.id,
      mapping.version,
      platform,
    );
    const sharedExecutable = path.join(sharedRoot, "bin", mapping.executable);
    const packages = bunPackageRoots(
      templateRoot,
      mapping.storePrefix,
      [...mapping.packagePath],
    );
    if (packages.length > 0 && !fs.existsSync(sharedExecutable)) {
      throw new Error(`shared ${mapping.id} binary is missing: ${sharedExecutable}`);
    }
    for (const packageRoot of packages) {
      const destination = path.join(packageRoot, ...mapping.legacyPath);
      fs.rmSync(destination, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(
        mapping.linkDirectory ? sharedRoot : sharedExecutable,
        destination,
        mapping.linkDirectory ? "dir" : "file",
      );
      linked++;
    }
  }
  return linked;
}

export function copyTemplateForRuntime(
  source: string,
  outputRoot: string,
  name: string,
): EmbeddedTemplate {
  const lock = path.join(source, "bun.lock");
  const dependencies = path.join(source, "node_modules");
  if (!fs.existsSync(lock)) throw new Error(`${name} has no bun.lock`);
  if (!fs.existsSync(dependencies)) throw new Error(`${name} has no installed node_modules`);
  const templateDestination = path.join(outputRoot, "templates", name);
  const dependencyDestination = path.join(outputRoot, "template-deps", name);
  fs.mkdirSync(path.dirname(templateDestination), { recursive: true });
  fs.mkdirSync(path.dirname(dependencyDestination), { recursive: true });
  fs.cpSync(source, templateDestination, {
    recursive: true,
    filter: (entry) => path.basename(entry) !== "node_modules",
  });
  // Bun installs package payloads as hardlinks from BUN_INSTALL_CACHE_DIR on
  // Linux. Moving the complete tree keeps those links intact, whereas a
  // recursive copy expands the same packages once per template and can add
  // tens of gigabytes to the image layer.
  fs.renameSync(dependencies, dependencyDestination);
  return { name, lockSha256: sha256File(lock) };
}

function gitRevision(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: ROOT, stdout: "pipe" });
  if (result.exitCode !== 0) throw new Error("unable to resolve git revision");
  return result.stdout.toString().trim();
}

async function main(): Promise<void> {
  const sourceRoot = path.resolve(flagValue("--source-root") ?? ROOT);
  const outputRoot = path.resolve(flagValue("--output-root") ?? "/opt/effectstream");
  const rootPackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const effectstreamVersion = flagValue("--effectstream-version") ?? rootPackage.version;
  const releaseSha = flagValue("--release-sha") ?? gitRevision();
  const platform = flagValue("--platform") ?? "linux-amd64";
  const skipInstall = process.argv.includes("--skip-install");
  const templates: EmbeddedTemplate[] = [];

  fs.mkdirSync(outputRoot, { recursive: true });
  for (const name of ENABLED_TEMPLATES) {
    const source = path.join(sourceRoot, "templates", name);
    if (!skipInstall) {
      console.log(`Installing ${name} with frozen lockfile...`);
      const install = Bun.spawn([
        "bun",
        "install",
        "--frozen-lockfile",
        "--backend",
        "hardlink",
      ], {
        cwd: source,
        env: { ...process.env },
        stdout: "inherit",
        stderr: "inherit",
      });
      if (await install.exited !== 0) throw new Error(`bun install failed for ${name}`);
    }
    linkDolosBinary(source, outputRoot, platform);
    linkLegacyBinaryCaches(source, outputRoot, platform);
    templates.push(copyTemplateForRuntime(source, outputRoot, name));
  }

  const artifactManifest = JSON.parse(
    fs.readFileSync(path.join(sourceRoot, ".github", "template-runtime-artifacts.json"), "utf8"),
  );
  const runtimeManifest = {
    schemaVersion: 1,
    effectstreamVersion,
    templateBaselineVersion: artifactManifest.templateBaselineVersion,
    releaseSha,
    platform,
    templates: templates.sort((a, b) => a.name.localeCompare(b.name)),
    artifacts: artifactManifest.artifacts
      .filter((artifact: any) =>
        artifact.platform === platform && artifact.profiles.includes("templates")
      )
      .map((artifact: any) => ({
        id: artifact.id,
        version: artifact.version,
        platform: artifact.platform,
        executableSha256: artifact.executableSha256,
      }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id)),
    toolchains: (artifactManifest.toolchains ?? [])
      .filter((toolchain: any) => toolchain.platform === platform)
      .map((toolchain: any) => ({
        id: toolchain.id,
        version: toolchain.version,
        platform: toolchain.platform,
        sha256: toolchain.sha256,
        ...(toolchain.executableSha256
          ? { executableSha256: toolchain.executableSha256 }
          : {}),
      }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(
    path.join(outputRoot, "runtime-manifest.json"),
    `${JSON.stringify(runtimeManifest, null, 2)}\n`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
