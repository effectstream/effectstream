#!/usr/bin/env bun

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ENABLED_TEMPLATES } from "../templates/enabled.ts";

export type Profile = "templates" | "e2e" | "all";

export interface Artifact {
  id: string;
  version: string;
  platform: string;
  profiles: Exclude<Profile, "all">[];
  url: string;
  sha256: string;
  archiveType: "zip" | "tar.gz" | "tar.bz2";
  stripComponents?: number;
  extractedPath: string;
  executable: string;
  executableSha256: string;
  consumers: string[];
  phase: string;
  license: string;
}

export interface ArtifactManifest {
  schemaVersion: number;
  templateBaselineVersion: string;
  defaultProfile: Profile;
  platforms: string[];
  artifacts: Artifact[];
  baseImages?: { id: string; version: string; platform: string; reference: string }[];
  toolchains?: {
    id: string;
    version: string;
    platform: string;
    url: string;
    sha256: string;
    executableSha256?: string;
    license: string;
  }[];
}

export interface Finding {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
}

const ROOT = path.resolve(import.meta.dir, "..");
const DEFAULT_MANIFEST = path.join(ROOT, ".github", "template-runtime-artifacts.json");
const MUTABLE_URL = /(?:\/latest\/|releases\/latest|:[Ll]atest(?:$|[/?#])|\/main\/|\/master\/)/;
const SHA256 = /^[a-f0-9]{64}$/;
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export function isMutableUrl(url: string): boolean {
  return MUTABLE_URL.test(url);
}

export function validateManifest(manifest: ArtifactManifest): Finding[] {
  const findings: Finding[] = [];
  if (manifest.schemaVersion !== 1) {
    findings.push({ level: "error", code: "schema-version", message: "schemaVersion must be 1" });
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.templateBaselineVersion)) {
    findings.push({ level: "error", code: "template-baseline-version", message: "templateBaselineVersion must be MAJOR.MINOR.PATCH" });
  }
  if (!(["templates", "e2e", "all"] as string[]).includes(manifest.defaultProfile)) {
    findings.push({ level: "error", code: "default-profile", message: "defaultProfile is invalid" });
  }
  const keys = new Set<string>();
  for (const artifact of manifest.artifacts) {
    const key = `${artifact.id}/${artifact.version}/${artifact.platform}`;
    if (keys.has(key)) {
      findings.push({ level: "error", code: "duplicate-artifact", message: `duplicate artifact ${key}` });
    }
    keys.add(key);
    for (const [field, digest] of [["sha256", artifact.sha256], ["executableSha256", artifact.executableSha256]]) {
      if (!SHA256.test(digest)) {
        findings.push({ level: "error", code: "invalid-checksum", message: `${key} has invalid ${field}` });
      }
    }
    if (isMutableUrl(artifact.url)) {
      findings.push({ level: "error", code: "mutable-url", message: `${key} uses mutable URL ${artifact.url}` });
    }
    if (!artifact.url.startsWith("https://")) {
      findings.push({ level: "error", code: "insecure-url", message: `${key} URL must use HTTPS` });
    }
    if (artifact.consumers.length === 0 || artifact.profiles.length === 0) {
      findings.push({ level: "error", code: "missing-consumers", message: `${key} needs profiles and consumers` });
    }
    if (artifact.stripComponents != null && (!Number.isInteger(artifact.stripComponents) || artifact.stripComponents < 0)) {
      findings.push({ level: "error", code: "invalid-strip-components", message: `${key} has invalid stripComponents` });
    }
  }
  for (const image of manifest.baseImages ?? []) {
    if (!/@sha256:[a-f0-9]{64}$/.test(image.reference)) {
      findings.push({ level: "error", code: "unpinned-base-image", message: `${image.id} is not digest-pinned` });
    }
  }
  const toolchainKeys = new Set<string>();
  for (const toolchain of manifest.toolchains ?? []) {
    const key = `${toolchain.id}/${toolchain.version}/${toolchain.platform}`;
    if (toolchainKeys.has(key)) {
      findings.push({ level: "error", code: "duplicate-toolchain", message: `duplicate toolchain ${key}` });
    }
    toolchainKeys.add(key);
    if (!SHA256.test(toolchain.sha256)) {
      findings.push({ level: "error", code: "invalid-checksum", message: `${key} has invalid sha256` });
    }
    if (toolchain.executableSha256 && !SHA256.test(toolchain.executableSha256)) {
      findings.push({ level: "error", code: "invalid-checksum", message: `${key} has invalid executableSha256` });
    }
    if (isMutableUrl(toolchain.url)) {
      findings.push({ level: "error", code: "mutable-url", message: `${key} uses mutable URL ${toolchain.url}` });
    }
    if (!toolchain.url.startsWith("https://")) {
      findings.push({ level: "error", code: "insecure-url", message: `${key} URL must use HTTPS` });
    }
  }
  return findings;
}

export function auditPackageJson(
  pkg: Record<string, any>,
  expectedVersion: string,
  publishable: Set<string>,
  file = "package.json",
): Finding[] {
  const findings: Finding[] = [];
  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, value] of Object.entries(pkg[section] ?? {})) {
      if (!name.startsWith("@effectstream/") || !publishable.has(name)) continue;
      if (value !== expectedVersion) {
        findings.push({
          level: "error",
          code: value === "*" || value === "latest" ? "floating-effectstream-dependency" : "effectstream-version-skew",
          message: `${name} in ${section} is ${JSON.stringify(value)}; expected ${expectedVersion}`,
          file,
        });
      }
    }
  }
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (/postinstall|preinstall|install/i.test(name)) {
      findings.push({ level: "warning", code: "lifecycle-download-risk", message: `${pkg.name ?? file} defines ${name}: ${command}`, file });
    }
  }
  return findings;
}

export function auditLockText(text: string, file = "bun.lock"): Finding[] {
  const findings: Finding[] = [];
  const nativeFamilies = [
    "@esbuild/linux-",
    "@rollup/rollup-linux-",
    "@nomicfoundation/edr-linux-",
    "@parcel/watcher-linux-",
    "sass-embedded-linux-",
    "@bloxbean/yaci-devkit-linux-x64",
    "@txpipe/dolos",
    "playwright-core",
  ];
  for (const family of nativeFamilies) {
    if (text.includes(family)) {
      findings.push({ level: "info", code: "native-or-external-payload", message: `lock contains ${family}`, file });
    }
  }
  return findings;
}

export function auditLockPresence(exists: boolean, file = "bun.lock"): Finding[] {
  return exists
    ? []
    : [{ level: "error", code: "missing-lockfile", message: "enabled template has no root bun.lock", file }];
}

function readManifest(file = DEFAULT_MANIFEST): ArtifactManifest {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function publishablePackageNames(): Set<string> {
  const names = new Set<string>();
  const glob = new Bun.Glob("packages/**/package.json");
  for (const relative of glob.scanSync({ cwd: ROOT })) {
    if (relative.includes("node_modules")) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
    if (pkg.name && !pkg.private && pkg.name !== "@effectstream/explorer") names.add(pkg.name);
  }
  return names;
}

export function auditRepository(manifest: ArtifactManifest): Finding[] {
  const findings = validateManifest(manifest);
  const publishable = publishablePackageNames();
  for (const template of ENABLED_TEMPLATES) {
    const templateDir = path.join(ROOT, "templates", template);
    const lock = path.join(templateDir, "bun.lock");
    const hasLock = fs.existsSync(lock);
    findings.push(...auditLockPresence(hasLock, lock));
    if (!hasLock) {
      // The dedicated finding above is sufficient; continue auditing package.json files.
    } else {
      findings.push(...auditLockText(fs.readFileSync(lock, "utf8"), lock));
    }
    const glob = new Bun.Glob("**/package.json");
    for (const relative of glob.scanSync({ cwd: templateDir })) {
      if (relative.includes("node_modules")) continue;
      const file = path.join(templateDir, relative);
      findings.push(...auditPackageJson(JSON.parse(fs.readFileSync(file, "utf8")), manifest.templateBaselineVersion, publishable, file));
    }
  }
  return findings;
}

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assertDigest(file: string, expected: string, label: string): void {
  const actual = sha256File(file);
  if (actual !== expected) {
    throw new Error(`${label} checksum mismatch: got ${actual}, expected ${expected}`);
  }
}

function artifactRoot(cacheRoot: string, artifact: Artifact): string {
  return path.join(cacheRoot, artifact.id, artifact.version, artifact.platform);
}

function verifyCachedArtifact(cacheRoot: string, artifact: Artifact): string {
  const executable = path.join(artifactRoot(cacheRoot, artifact), "bin", artifact.executable);
  if (!fs.existsSync(executable)) throw new Error(`${artifact.id} is missing: ${executable}`);
  assertDigest(executable, artifact.executableSha256, artifact.id);
  return executable;
}

function extractArchive(
  archive: string,
  type: Artifact["archiveType"],
  destination: string,
  stripComponents = 0,
): void {
  if (type === "zip" && stripComponents !== 0) {
    throw new Error("stripComponents is not supported for zip artifacts");
  }
  const argv = type === "zip"
    ? ["unzip", "-q", archive, "-d", destination]
    : type === "tar.gz"
    ? ["tar", "xzf", archive, "-C", destination, `--strip-components=${stripComponents}`]
    : ["tar", "xjf", archive, "-C", destination, `--strip-components=${stripComponents}`];
  const result = Bun.spawnSync(argv, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`${argv[0]} failed for ${archive}`);
}

export async function prewarmArtifact(cacheRoot: string, artifact: Artifact): Promise<string> {
  try {
    return verifyCachedArtifact(cacheRoot, artifact);
  } catch (error) {
    if (fs.existsSync(artifactRoot(cacheRoot, artifact))) throw error;
  }
  const parent = path.dirname(artifactRoot(cacheRoot, artifact));
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, `.${artifact.platform}-`));
  const archive = path.join(temporary, `payload.${artifact.archiveType.replace(".", "-")}`);
  const extracted = path.join(temporary, "extracted");
  const staging = path.join(temporary, "staging");
  try {
    const response = await fetch(artifact.url, { redirect: "follow" });
    if (!response.ok) throw new Error(`download failed (${response.status}) for ${artifact.url}`);
    if (!response.body) throw new Error(`download returned no body for ${artifact.url}`);
    await pipeline(
      Readable.fromWeb(response.body as any),
      fs.createWriteStream(archive),
    );
    assertDigest(archive, artifact.sha256, `${artifact.id} archive`);
    fs.mkdirSync(extracted);
    extractArchive(archive, artifact.archiveType, extracted, artifact.stripComponents);
    fs.cpSync(extracted, staging, { recursive: true });
    const sourceExecutable = path.join(staging, artifact.extractedPath);
    assertDigest(sourceExecutable, artifact.executableSha256, artifact.id);
    const finalExecutable = path.join(staging, "bin", artifact.executable);
    fs.mkdirSync(path.dirname(finalExecutable), { recursive: true });
    if (sourceExecutable !== finalExecutable) {
      if (fs.existsSync(finalExecutable)) fs.unlinkSync(finalExecutable);
      fs.renameSync(sourceExecutable, finalExecutable);
    }
    fs.chmodSync(finalExecutable, 0o755);
    const metadata = {
      schemaVersion: 1,
      id: artifact.id,
      version: artifact.version,
      platform: artifact.platform,
      source: artifact.url,
      archiveSha256: artifact.sha256,
      executable: `bin/${artifact.executable}`,
      executableSha256: artifact.executableSha256,
      stripComponents: artifact.stripComponents ?? 0,
      consumers: [...artifact.consumers].sort(),
      license: artifact.license,
    };
    fs.writeFileSync(path.join(staging, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    fs.renameSync(staging, artifactRoot(cacheRoot, artifact));
    return verifyCachedArtifact(cacheRoot, artifact);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function flagValue(name: string): string | undefined {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function selectedArtifacts(manifest: ArtifactManifest, profile: Profile, platform: string): Artifact[] {
  return manifest.artifacts.filter((artifact) =>
    artifact.platform === platform && (profile === "all" || artifact.profiles.includes(profile))
  );
}

async function main(): Promise<void> {
  const manifestPath = path.resolve(flagValue("--manifest") ?? DEFAULT_MANIFEST);
  const manifest = readManifest(manifestPath);
  const profile = (flagValue("--profile") ?? manifest.defaultProfile) as Profile;
  const platform = flagValue("--platform") ?? "linux-amd64";
  const json = process.argv.includes("--json");
  const verifyOnly = process.argv.includes("--verify-only");
  const offlineCheck = process.argv.includes("--offline-check");
  const cacheRoot = path.resolve(flagValue("--cache-root") ?? path.join(os.tmpdir(), "effectstream-runtime-artifacts"));
  if (!(["templates", "e2e", "all"] as string[]).includes(profile)) throw new Error(`invalid profile: ${profile}`);
  const findings = auditRepository(manifest);
  const errors = findings.filter((finding) => finding.level === "error");
  if (json) console.log(JSON.stringify({ manifest: manifestPath, profile, platform, findings }, null, 2));
  else {
    for (const finding of findings) {
      const location = finding.file ? ` (${path.relative(ROOT, finding.file)})` : "";
      console.log(`[${finding.level.toUpperCase()}] ${finding.code}: ${finding.message}${location}`);
    }
    console.log(`Audit: ${errors.length} error(s), ${findings.filter((f) => f.level === "warning").length} warning(s)`);
  }
  if (errors.length) process.exitCode = 1;
  if (verifyOnly || errors.length) return;
  const artifacts = selectedArtifacts(manifest, profile, platform);
  if (artifacts.length === 0) throw new Error(`no artifacts for ${profile}/${platform}`);
  for (const artifact of artifacts) {
    const executable = offlineCheck
      ? verifyCachedArtifact(cacheRoot, artifact)
      : await prewarmArtifact(cacheRoot, artifact);
    if (!json) console.log(`${offlineCheck ? "Verified" : "Ready"}: ${artifact.id} -> ${executable}`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
