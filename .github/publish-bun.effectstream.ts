#!/usr/bin/env bun

// The legacy root unpublish-bun.effectstream.ts script has an incomplete static
// package list and is not a recovery mechanism. npm unpublish is non-atomic;
// release recovery must complete the exact persisted bundle through this file.

import { $ } from "bun";
import { createHash } from "crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, join, relative, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
export const EXPECTED_PACKAGE_COUNT = 39;
export const STABLE_DIST_TAG = "latest";
export const RELEASE_BUNDLE_SCHEMA = 1;
const DEPRECATED = new Set(["@effectstream/explorer"]);
const LICENSE_FILES = ["LICENSE-MIT", "LICENSE-APACHE"] as const;
const MIN_README_CHARS = 400;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const FULL_SHA_RE = /^[0-9a-f]{40}$/;

type PrereleaseIdentifier =
  | { numeric: true; value: bigint; raw: string }
  | { numeric: false; value: string; raw: string };
export type ParsedSemver = {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: PrereleaseIdentifier[];
  build: string[];
  normalized: string;
};
export type ReleaseKind = "maintenance-stable" | "node2-stable" | "node2-prerelease";
export type ReleasePolicy = {
  version: string;
  releaseTag: string;
  branch: "midnight-1" | "v-next";
  distTag: "midnight-1" | "latest" | "next";
  prerelease: boolean;
  kind: ReleaseKind;
};
export type RegistryPackageState = {
  name: string;
  targetIntegrity: string | null;
  distTags: Record<string, string>;
};
export type ManifestPackage = {
  name: string;
  relativeDir: string;
  filename: string;
  size: number;
  sha512: string;
  integrity: string;
  versionBefore: string;
};
export type ReleaseManifest = {
  schemaVersion: 1;
  releaseTag: string;
  version: string;
  sourceSha: string;
  branch: "midnight-1" | "v-next";
  distTag: "midnight-1" | "latest" | "next";
  prerelease: boolean;
  kind: ReleaseKind;
  workflow: { runId: string; runAttempt: string };
  toolchain: { bun: string; platform: string };
  latestBefore: Record<string, string>;
  packages: ManifestPackage[];
};
type PackageInfo = {
  name: string;
  dir: string;
  relativeDir: string;
  manifestPath: string;
  pkg: Record<string, any>;
};

export function parseSemver(input: string): ParsedSemver {
  if (input !== input.trim()) throw new Error(`"${input}" is not a valid SemVer version`);
  const candidate = input.startsWith("v") ? input.slice(1) : input;
  const match = SEMVER_RE.exec(candidate);
  if (!match) throw new Error(`"${input}" is not a valid SemVer version`);
  const prerelease = (match[4] ? match[4].split(".") : []).map((raw) =>
    /^\d+$/.test(raw)
      ? ({ numeric: true, value: BigInt(raw), raw } as const)
      : ({ numeric: false, value: raw, raw } as const),
  );
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
    build: match[5] ? match[5].split(".") : [],
    normalized: candidate,
  };
}

export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (!left) return -1;
    if (!right) return 1;
    if (left.numeric && right.numeric) {
      if (left.value < right.value) return -1;
      if (left.value > right.value) return 1;
    } else if (left.numeric !== right.numeric) {
      return left.numeric ? -1 : 1;
    } else {
      const comparison = String(left.value).localeCompare(String(right.value));
      if (comparison) return comparison;
    }
  }
  return 0;
}

export function resolveReleaseVersion(tag: string, current: string): string {
  const next = parseSemver(tag);
  const previous = parseSemver(current);
  if (compareSemver(next, previous) <= 0) {
    throw new Error(
      `Release version ${next.normalized} must be strictly greater than current ${previous.normalized}`,
    );
  }
  return next.normalized;
}

export function resolveReleasePolicy(
  releaseTag: string,
  requestedBranch?: string,
  requestedDistTag?: string,
  githubPrerelease?: boolean,
): ReleasePolicy {
  if (!releaseTag.startsWith("v")) throw new Error("Release tag must begin with one lowercase v");
  const parsed = parseSemver(releaseTag);
  if (parsed.build.length) throw new Error("Build metadata is not supported for releases");
  if (parsed.major !== 0n) throw new Error(`Unsupported release family ${parsed.normalized}`);
  let policy: ReleasePolicy;
  if (parsed.minor === 104n && parsed.prerelease.length === 0) {
    policy = { version: parsed.normalized, releaseTag, branch: "midnight-1", distTag: "midnight-1", prerelease: false, kind: "maintenance-stable" };
  } else if (parsed.minor === 200n && parsed.prerelease.length === 0) {
    policy = { version: parsed.normalized, releaseTag, branch: "v-next", distTag: "latest", prerelease: false, kind: "node2-stable" };
  } else if (parsed.minor === 200n && parsed.prerelease.length > 0) {
    policy = { version: parsed.normalized, releaseTag, branch: "v-next", distTag: "next", prerelease: true, kind: "node2-prerelease" };
  } else if (parsed.minor === 104n) {
    throw new Error("Maintenance prereleases are not supported");
  } else {
    throw new Error(`Unsupported release family ${parsed.normalized}`);
  }
  if (githubPrerelease !== undefined && githubPrerelease !== policy.prerelease) {
    throw new Error(`GitHub prerelease=${githubPrerelease} disagrees with release tag ${releaseTag}`);
  }
  if (requestedBranch !== undefined && requestedBranch !== policy.branch) {
    throw new Error(`Release ${policy.version} requires branch ${policy.branch}, not ${requestedBranch}`);
  }
  if (requestedDistTag !== undefined && requestedDistTag !== policy.distTag) {
    throw new Error(`Release ${policy.version} requires dist-tag ${policy.distTag}, not ${requestedDistTag}`);
  }
  return policy;
}

export function resolveDistTag(version: string, requestedTag?: string): string {
  if (!requestedTag) throw new Error("--dist-tag is required for every release");
  return resolveReleasePolicy(version.startsWith("v") ? version : `v${version}`, undefined, requestedTag).distTag;
}

export function setVersionInText(text: string, version: string): string {
  return text.replace(/"version":(\s*)"[^"]*"/, `"version":$1"${version}"`);
}

function sortObject(value: any): any {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
  }
  return value;
}
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortObject(value))}\n`;
}
function sha512File(path: string): { hex: string; integrity: string } {
  const digest = createHash("sha512").update(readFileSync(path)).digest();
  return { hex: digest.toString("hex"), integrity: `sha512-${digest.toString("base64")}` };
}
export function isSecretLikeTarEntry(entry: string): boolean {
  const name = basename(entry).toLowerCase();
  return name === ".npmrc"
    || name === ".env"
    || name.startsWith(".env.")
    || /^(?:npm|bun|registry|github|gh)[_-]?(?:auth[_-]?)?token(?:\.[^/]*)?$/.test(name)
    || /^(?:auth[_-]?token|credentials|secrets?)(?:\.[^/]*)?$/.test(name)
    || /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.[^/]*)?$/.test(name)
    || /\.(?:pem|p12|pfx)$/.test(name);
}
function getFlagValue(flag: string): string | undefined {
  const direct = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function requireFlag(flag: string): string {
  const value = getFlagValue(flag);
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function discoverPackages(root = ROOT): PackageInfo[] {
  const manifests = new Bun.Glob("packages/**/package.json");
  const packages: PackageInfo[] = [];
  for (const path of manifests.scanSync({ cwd: root })) {
    if (path.includes("node_modules")) continue;
    const manifestPath = resolve(root, path);
    const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!pkg.name || pkg.private || DEPRECATED.has(pkg.name)) continue;
    packages.push({ name: pkg.name, dir: resolve(manifestPath, ".."), relativeDir: relative(root, resolve(manifestPath, "..")), manifestPath, pkg });
  }
  packages.sort((left, right) => left.name.localeCompare(right.name));
  if (packages.length !== EXPECTED_PACKAGE_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_PACKAGE_COUNT} publishable packages, found ${packages.length}`);
  }
  return packages;
}
function assertCleanTree(root = ROOT): void {
  const status = Bun.spawnSync(["git", "status", "--porcelain=v1", "--untracked-files=all"], { cwd: root });
  if (status.exitCode !== 0) throw new Error("git status failed");
  if (status.stdout.toString().trim()) throw new Error("Uncommitted changes detected");
}
function assertPackageInputs(packages: PackageInfo[], currentVersion: string): void {
  for (const license of LICENSE_FILES) if (!existsSync(join(ROOT, license))) throw new Error(`Missing root ${license}`);
  for (const pkg of packages) {
    if (pkg.pkg.version !== currentVersion) throw new Error(`${pkg.name} version ${pkg.pkg.version} differs from root ${currentVersion}`);
    const readme = join(pkg.dir, "README.md");
    if (!existsSync(readme)) throw new Error(`Missing README for ${pkg.name}`);
    if (readFileSync(readme, "utf8").trim().length < MIN_README_CHARS) throw new Error(`README for ${pkg.name} is shorter than ${MIN_README_CHARS} characters`);
  }
}
function packageRegistryUrl(registry: string, name: string): string {
  return `${registry.replace(/\/$/, "")}/${encodeURIComponent(name)}`;
}
export async function readRegistryState(registry: string, name: string, targetVersion: string, request: typeof fetch = fetch): Promise<RegistryPackageState> {
  const response = await request(packageRegistryUrl(registry, name), { headers: { accept: "application/vnd.npm.install-v1+json, application/json" } });
  if (response.status === 404) return { name, targetIntegrity: null, distTags: {} };
  if (!response.ok) throw new Error(`Registry query failed for ${name}: HTTP ${response.status}`);
  const document = (await response.json()) as any;
  return { name, targetIntegrity: document.versions?.[targetVersion]?.dist?.integrity ?? null, distTags: document["dist-tags"] ?? {} };
}
function assertUniformNode2Latest(states: RegistryPackageState[]): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const values = new Set<string>();
  for (const state of states) {
    const latest = state.distTags.latest;
    if (!latest) throw new Error(`Registry package ${state.name} has no latest tag`);
    const parsed = parseSemver(latest);
    if (parsed.major !== 0n || parsed.minor !== 200n || parsed.prerelease.length || parsed.build.length) throw new Error(`Registry package ${state.name} has invalid latest=${latest}`);
    values.add(latest);
    snapshot[state.name] = latest;
  }
  if (values.size !== 1) throw new Error("Registry latest tags are not one uniform 0.200.x value");
  return snapshot;
}
export function preflightOrdinary(policy: ReleasePolicy, states: RegistryPackageState[]): Record<string, string> {
  if (states.length !== EXPECTED_PACKAGE_COUNT) throw new Error(`Preflight expected ${EXPECTED_PACKAGE_COUNT} packages, got ${states.length}`);
  for (const state of states) if (state.targetIntegrity !== null) throw new Error(`${state.name}@${policy.version} already exists`);
  const latest = assertUniformNode2Latest(states);
  if (policy.kind === "node2-stable" && compareSemver(parseSemver(policy.version), parseSemver(Object.values(latest)[0])) <= 0) {
    throw new Error(`Stable Node-2 target ${policy.version} must be greater than current latest`);
  }
  return latest;
}
export function verifyLatestPostcondition(manifest: ReleaseManifest, states: RegistryPackageState[]): void {
  for (const state of states) {
    const latest = state.distTags.latest;
    if (manifest.kind === "node2-stable") {
      if (latest !== manifest.version) throw new Error(`${state.name} latest=${latest ?? "missing"}, expected ${manifest.version}`);
    } else if (latest !== manifest.latestBefore[state.name]) {
      throw new Error(`${state.name} latest changed from ${manifest.latestBefore[state.name]} to ${latest ?? "missing"}`);
    }
    if (state.distTags[manifest.distTag] !== manifest.version) throw new Error(`${state.name} ${manifest.distTag}=${state.distTags[manifest.distTag] ?? "missing"}, expected ${manifest.version}`);
  }
}
export function planRegistryCompletion(manifest: ReleaseManifest, states: RegistryPackageState[], recovery: boolean): { missing: string[]; existing: string[] } {
  const byName = new Map(states.map((state) => [state.name, state]));
  const missing: string[] = [];
  const existing: string[] = [];
  for (const pkg of manifest.packages) {
    const state = byName.get(pkg.name);
    if (!state || state.targetIntegrity === null) missing.push(pkg.name);
    else if (state.targetIntegrity === pkg.integrity && recovery) existing.push(pkg.name);
    else if (state.targetIntegrity === pkg.integrity) throw new Error(`${pkg.name}@${manifest.version} became occupied during ordinary publish`);
    else throw new Error(`${pkg.name}@${manifest.version} registry integrity differs from artifact`);
  }
  return { missing, existing };
}
function applyPackManifest(pkg: PackageInfo, version: string): void {
  const data = JSON.parse(readFileSync(pkg.manifestPath, "utf8"));
  data.version = version;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (!data[field]) continue;
    for (const [name, value] of Object.entries(data[field])) {
      if (typeof value === "string" && value.startsWith("workspace:") && name.startsWith("@effectstream/")) data[field][name] = version;
    }
  }
  if (Array.isArray(data.files)) for (const license of LICENSE_FILES) if (!data.files.includes(license)) data.files.push(license);
  data.homepage = "https://effectstream.github.io/docs/";
  data.repository = { type: "git", url: "https://github.com/effectstream/effectstream", directory: pkg.relativeDir };
  data.bugs = { url: "https://github.com/effectstream/effectstream/issues" };
  writeFileSync(pkg.manifestPath, `${JSON.stringify(data, null, 2)}\n`);
}
function restoreVersionOnly(packages: PackageInfo[], originals: Map<string, string>, version: string, stagedLicenses: string[]): void {
  for (const pkg of packages) writeFileSync(pkg.manifestPath, setVersionInText(originals.get(pkg.manifestPath)!, version));
  for (const path of stagedLicenses) if (existsSync(path)) unlinkSync(path);
}

export async function prepareReleaseBundle(options: {
  releaseTag: string; sourceSha: string; sourceBranch: string; distTag: string; githubPrerelease: boolean;
  registry: string; artifactDir: string; runId: string; runAttempt: string;
}): Promise<ReleaseManifest> {
  const policy = resolveReleasePolicy(options.releaseTag, options.sourceBranch, options.distTag, options.githubPrerelease);
  if (!FULL_SHA_RE.test(options.sourceSha)) throw new Error("--source-sha must be a full lowercase SHA");
  assertCleanTree();
  const head = (await $`git -C ${ROOT} rev-parse HEAD^{commit}`.text()).trim();
  if (head !== options.sourceSha) throw new Error(`HEAD ${head} differs from source ${options.sourceSha}`);
  const rootManifest = join(ROOT, "package.json");
  const rootOriginal = readFileSync(rootManifest, "utf8");
  const currentVersion = JSON.parse(rootOriginal).version;
  resolveReleaseVersion(options.releaseTag, currentVersion);
  const packages = discoverPackages();
  assertPackageInputs(packages, currentVersion);
  const preflightStates = await Promise.all(packages.map((pkg) => readRegistryState(options.registry, pkg.name, policy.version)));
  const latestBefore = preflightOrdinary(policy, preflightStates);
  rmSync(options.artifactDir, { recursive: true, force: true });
  const tarballDir = join(options.artifactDir, "tarballs");
  mkdirSync(tarballDir, { recursive: true });
  const originals = new Map<string, string>();
  const stagedLicenses: string[] = [];
  for (const pkg of packages) originals.set(pkg.manifestPath, readFileSync(pkg.manifestPath, "utf8"));
  let prepared = false;
  try {
    writeFileSync(rootManifest, setVersionInText(rootOriginal, policy.version));
    for (const pkg of packages) {
      applyPackManifest(pkg, policy.version);
      for (const license of LICENSE_FILES) {
        const destination = join(pkg.dir, license);
        if (!existsSync(destination)) { copyFileSync(join(ROOT, license), destination); stagedLicenses.push(destination); }
      }
    }
    const frontend = packages.find((pkg) => pkg.name === "@effectstream/frontend-sdk");
    if (!frontend) throw new Error("Missing @effectstream/frontend-sdk");
    await $`bun run build`.cwd(frontend.dir).quiet();
    const manifestPackages: ManifestPackage[] = [];
    for (const pkg of packages) {
      const filename = `${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${policy.version}.tgz`;
      await $`bun pm pack --filename ${join(tarballDir, filename)} --gzip-level 9 --quiet`.cwd(pkg.dir).quiet();
      const tarball = join(tarballDir, filename);
      const listing = (await $`tar -tzf ${tarball}`.text()).split("\n").filter(Boolean);
      if (listing.some(isSecretLikeTarEntry)) throw new Error(`Secret-like or auth file found in ${filename}`);
      const digest = sha512File(tarball);
      manifestPackages.push({ name: pkg.name, relativeDir: pkg.relativeDir, filename, size: statSync(tarball).size, sha512: digest.hex, integrity: digest.integrity, versionBefore: currentVersion });
    }
    const manifest: ReleaseManifest = {
      schemaVersion: RELEASE_BUNDLE_SCHEMA,
      releaseTag: policy.releaseTag, version: policy.version, sourceSha: options.sourceSha,
      branch: policy.branch, distTag: policy.distTag, prerelease: policy.prerelease, kind: policy.kind,
      workflow: { runId: options.runId, runAttempt: options.runAttempt },
      toolchain: { bun: Bun.version, platform: `${process.platform}-${process.arch}` },
      latestBefore, packages: manifestPackages,
    };
    writeFileSync(join(options.artifactDir, "manifest.json"), canonicalJson(manifest), { mode: 0o444 });
    prepared = true;
    restoreVersionOnly(packages, originals, policy.version, stagedLicenses);
    return manifest;
  } finally {
    if (!prepared) {
      writeFileSync(rootManifest, rootOriginal);
      for (const [path, text] of originals) writeFileSync(path, text);
      for (const path of stagedLicenses) if (existsSync(path)) unlinkSync(path);
      rmSync(options.artifactDir, { recursive: true, force: true });
    }
  }
}

export function readAndVerifyBundle(artifactDir: string, expectedManifestSha512?: string): ReleaseManifest {
  const manifestPath = join(artifactDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Artifact manifest is missing");
  const manifestBytes = readFileSync(manifestPath);
  const manifestDigest = createHash("sha512").update(manifestBytes).digest("hex");
  if (expectedManifestSha512 && manifestDigest !== expectedManifestSha512) throw new Error("Artifact manifest digest mismatch");
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as ReleaseManifest;
  if (manifest.schemaVersion !== RELEASE_BUNDLE_SCHEMA) throw new Error("Unsupported manifest schema");
  resolveReleasePolicy(manifest.releaseTag, manifest.branch, manifest.distTag, manifest.prerelease);
  if (!FULL_SHA_RE.test(manifest.sourceSha)) throw new Error("Manifest source SHA is invalid");
  if (manifest.packages.length !== EXPECTED_PACKAGE_COUNT) throw new Error("Manifest package count is invalid");
  if (new Set(manifest.packages.map((pkg) => pkg.name)).size !== EXPECTED_PACKAGE_COUNT) throw new Error("Duplicate package in manifest");
  for (const pkg of manifest.packages) {
    const path = join(artifactDir, "tarballs", pkg.filename);
    if (basename(path) !== pkg.filename || !existsSync(path)) throw new Error(`Missing tarball ${pkg.filename}`);
    if (statSync(path).size !== pkg.size) throw new Error(`Tarball size mismatch for ${pkg.name}`);
    const digest = sha512File(path);
    if (digest.hex !== pkg.sha512 || digest.integrity !== pkg.integrity) throw new Error(`Tarball digest mismatch for ${pkg.name}`);
  }
  const allowedFiles = ["manifest.json", ...manifest.packages.map((pkg) => `tarballs/${pkg.filename}`)].sort();
  const actualFiles = ["manifest.json", ...readdirSync(join(artifactDir, "tarballs")).map((name) => `tarballs/${name}`)].sort();
  if (canonicalJson(readdirSync(artifactDir).sort()) !== canonicalJson(["manifest.json", "tarballs"])) throw new Error("Artifact contains unrelated top-level files");
  if (canonicalJson(actualFiles) !== canonicalJson(allowedFiles)) throw new Error("Artifact contains missing or unrelated files");
  return manifest;
}
export function assertRecoveryLatestPrecondition(manifest: ReleaseManifest, states: RegistryPackageState[]): void {
  for (const state of states) {
    const latest = state.distTags.latest;
    const before = manifest.latestBefore[state.name];
    if (!before) throw new Error(`Persisted latest snapshot lacks ${state.name}`);
    if (manifest.kind === "node2-stable") {
      if (latest !== before && latest !== manifest.version) throw new Error(`${state.name} latest is neither persisted pre-state nor target`);
    } else if (latest !== before) throw new Error(`${state.name} latest differs from persisted snapshot`);
  }
}
async function setDistTag(name: string, version: string, distTag: string, registry: string): Promise<void> {
  const token = process.env.NPM_TOKEN ?? process.env.BUN_AUTH_TOKEN;
  if (!token) throw new Error("NPM_TOKEN is required to set dist-tags");
  const response = await fetch(
    `${registry.replace(/\/$/, "")}/-/package/${encodeURIComponent(name)}/dist-tags/${encodeURIComponent(distTag)}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(version),
    },
  );
  if (!response.ok) throw new Error(`Failed to set ${name} ${distTag}: HTTP ${response.status}`);
}
export async function publishFromBundle(options: { artifactDir: string; registry: string; recovery: boolean; publish: boolean; manifestSha512?: string }): Promise<{ published: string[]; skipped: string[] }> {
  const manifest = readAndVerifyBundle(options.artifactDir, options.manifestSha512);
  const results: { name: string; status: string }[] = [];
  const writeResults = () => writeFileSync(`${options.artifactDir}.publish-result.json`, canonicalJson({ releaseTag: manifest.releaseTag, sourceSha: manifest.sourceSha, recovery: options.recovery, packages: results }));
  writeResults();
  const states = await Promise.all(manifest.packages.map((pkg) => readRegistryState(options.registry, pkg.name, manifest.version)));
  if (options.recovery) assertRecoveryLatestPrecondition(manifest, states);
  const completion = planRegistryCompletion(manifest, states, options.recovery);
  const published: string[] = [];
  results.push(...completion.existing.map((name) => ({ name, status: "skipped-exact" })));
  writeResults();
  for (const name of completion.missing) {
    const pkg = manifest.packages.find((candidate) => candidate.name === name)!;
    if (options.publish) {
      const command = options.recovery ? "bun" : "npm";
      const env = options.recovery ? process.env : { ...process.env, NPM_CONFIG_FETCH_RETRIES: "0" };
      const proc = Bun.spawn([command, "publish", "--access", "public", "--tag", manifest.distTag, "--registry", options.registry, join(options.artifactDir, "tarballs", pkg.filename)], { cwd: ROOT, stdout: "inherit", stderr: "inherit", env });
      if ((await proc.exited) !== 0) {
        results.push({ name, status: "failed" });
        writeResults();
        throw new Error(`Publish failed for ${name}; stopping`);
      }
    }
    published.push(name);
    results.push({ name, status: options.publish ? "published" : "would-publish" });
    writeResults();
  }
  if (!options.publish) return { published, skipped: completion.existing };
  const complete = await Promise.all(manifest.packages.map((pkg) => readRegistryState(options.registry, pkg.name, manifest.version)));
  for (const pkg of manifest.packages) {
    const state = complete.find((candidate) => candidate.name === pkg.name)!;
    if (state.targetIntegrity !== pkg.integrity) throw new Error(`Post-publish integrity mismatch for ${pkg.name}`);
  }
  if (options.recovery) for (const pkg of manifest.packages) await setDistTag(pkg.name, manifest.version, manifest.distTag, options.registry);
  const post = await Promise.all(manifest.packages.map((pkg) => readRegistryState(options.registry, pkg.name, manifest.version)));
  verifyLatestPostcondition(manifest, post);
  return { published, skipped: completion.existing };
}

export type RecoveryMode = "partial-tag" | "complete-tag" | "partial-advanced" | "complete-advanced";
const RECOVERY_MODES = new Set<RecoveryMode>(["partial-tag", "complete-tag", "partial-advanced", "complete-advanced"]);
function requireRecoveryMode(value: string): RecoveryMode {
  if (!RECOVERY_MODES.has(value as RecoveryMode)) throw new Error(`Unsupported recovery mode ${value}`);
  return value as RecoveryMode;
}
export function classifyRecoveryMode(partial: boolean, advanced: boolean): RecoveryMode {
  return `${partial ? "partial" : "complete"}-${advanced ? "advanced" : "tag"}` as RecoveryMode;
}
export function validateRecoveryBranchState(
  manifest: ReleaseManifest,
  mode: RecoveryMode,
  head: string,
  sourceIsAncestor: boolean,
  currentVersions: string[],
): void {
  if (!FULL_SHA_RE.test(head)) throw new Error("Expected current branch SHA is invalid");
  const advanced = mode.endsWith("advanced");
  if (!advanced && head !== manifest.sourceSha) throw new Error("Tag-state recovery requires branch at source SHA");
  if (advanced && head === manifest.sourceSha) throw new Error("Advanced recovery requires an advanced branch");
  if (advanced && !sourceIsAncestor) throw new Error("Advanced branch does not descend from release source");
  const expectedBefore = manifest.packages[0].versionBefore;
  if (currentVersions.some((version) => version !== expectedBefore)) throw new Error("Version drift in recovery branch");
}
export async function validateRecoveryCheckout(manifest: ReleaseManifest, mode: RecoveryMode, expectedCurrentBranchSha: string): Promise<string[]> {
  if (!FULL_SHA_RE.test(expectedCurrentBranchSha)) throw new Error("Expected current branch SHA is invalid");
  const head = (await $`git -C ${ROOT} rev-parse HEAD^{commit}`.text()).trim();
  if (head !== expectedCurrentBranchSha) throw new Error(`Current HEAD ${head} differs from approved ${expectedCurrentBranchSha}`);
  const rootPath = join(ROOT, "package.json");
  const packageByName = new Map(discoverPackages().map((pkg) => [pkg.name, pkg]));
  const versionFiles = [rootPath, ...manifest.packages.map((pkg) => packageByName.get(pkg.name)?.manifestPath ?? "")];
  if (versionFiles.some((path) => !path)) throw new Error("Current branch package set differs from artifact");
  const currentVersions = versionFiles.map((path) => JSON.parse(readFileSync(path, "utf8")).version as string);
  const sourceIsAncestor = Bun.spawnSync(["git", "merge-base", "--is-ancestor", manifest.sourceSha, head], { cwd: ROOT }).exitCode === 0;
  validateRecoveryBranchState(manifest, mode, head, sourceIsAncestor, currentVersions);
  return versionFiles;
}
async function applyRecoveryVersionDelta(manifest: ReleaseManifest, mode: RecoveryMode, expectedCurrentBranchSha: string): Promise<void> {
  const versionFiles = await validateRecoveryCheckout(manifest, mode, expectedCurrentBranchSha);
  for (const path of versionFiles) writeFileSync(path, setVersionInText(readFileSync(path, "utf8"), manifest.version));
}

async function cli(): Promise<void> {
  const registry = getFlagValue("--registry") ?? "https://registry.npmjs.org";
  if (process.argv.includes("--policy")) {
    console.log(canonicalJson(resolveReleasePolicy(requireFlag("--release-tag"), getFlagValue("--source-branch"), getFlagValue("--dist-tag"), getFlagValue("--github-prerelease") === undefined ? undefined : getFlagValue("--github-prerelease") === "true")).trim());
    return;
  }
  if (process.argv.includes("--prepare")) {
    const artifactDir = requireFlag("--artifact-dir");
    const manifest = await prepareReleaseBundle({
      releaseTag: requireFlag("--release-tag"), sourceSha: requireFlag("--source-sha"), sourceBranch: requireFlag("--source-branch"), distTag: requireFlag("--dist-tag"), githubPrerelease: requireFlag("--github-prerelease") === "true",
      registry, artifactDir, runId: requireFlag("--run-id"), runAttempt: requireFlag("--run-attempt"),
    });
    const manifestSha512 = sha512File(join(artifactDir, "manifest.json")).hex;
    if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `manifest-sha512=${manifestSha512}\npackage-count=${manifest.packages.length}\nartifact-name=release-${manifest.releaseTag}-${manifest.sourceSha}-${manifest.workflow.runId}\n`, { flag: "a" });
    console.log(`Prepared ${manifest.packages.length} exact tarballs; manifest sha512=${manifestSha512}`);
    return;
  }
  if (process.argv.includes("--publish-bundle")) {
    console.log(canonicalJson(await publishFromBundle({ artifactDir: requireFlag("--artifact-dir"), registry, recovery: false, publish: process.argv.includes("--publish"), manifestSha512: getFlagValue("--manifest-sha512") })).trim());
    return;
  }
  if (process.argv.includes("--validate-recovery-branch")) {
    const artifactDir = requireFlag("--artifact-dir");
    const manifest = readAndVerifyBundle(artifactDir, requireFlag("--manifest-sha512"));
    const mode = requireRecoveryMode(requireFlag("--recovery-mode"));
    const expectedCurrentBranchSha = requireFlag("--expected-current-branch-sha");
    await validateRecoveryCheckout(manifest, mode, expectedCurrentBranchSha);
    console.log(canonicalJson({ releaseTag: manifest.releaseTag, sourceSha: manifest.sourceSha, branch: manifest.branch, recoveryMode: mode, currentBranchSha: expectedCurrentBranchSha, compatible: true }).trim());
    return;
  }
  if (process.argv.includes("--recover-bundle")) {
    const auditRef = requireFlag("--audit-ref");
    const authorizationRef = requireFlag("--authorization-ref");
    const artifactDir = requireFlag("--artifact-dir");
    const manifestSha512 = requireFlag("--manifest-sha512");
    const manifest = readAndVerifyBundle(artifactDir, manifestSha512);
    const expectedCurrentBranchSha = requireFlag("--expected-current-branch-sha");
    const requested = requireRecoveryMode(requireFlag("--recovery-mode"));
    await validateRecoveryCheckout(manifest, requested, expectedCurrentBranchSha);
    const states = await Promise.all(manifest.packages.map((pkg) => readRegistryState(registry, pkg.name, manifest.version)));
    assertRecoveryLatestPrecondition(manifest, states);
    const completion = planRegistryCompletion(manifest, states, true);
    const observed = classifyRecoveryMode(completion.missing.length > 0, expectedCurrentBranchSha !== manifest.sourceSha);
    if (requested !== observed) throw new Error(`Recovery mode ${requested} differs from observed ${observed}`);
    const result = await publishFromBundle({ artifactDir, registry, recovery: true, publish: process.argv.includes("--publish"), manifestSha512 });
    if (process.argv.includes("--publish")) await applyRecoveryVersionDelta(manifest, requested, expectedCurrentBranchSha);
    const final = { originalRunId: manifest.workflow.runId, recoveryRunId: process.env.GITHUB_RUN_ID ?? "local", artifactId: getFlagValue("--artifact-id") ?? "local", serviceDigest: getFlagValue("--service-digest") ?? "local", manifestSha512, recoveryMode: requested, releaseTag: manifest.releaseTag, version: manifest.version, branch: manifest.branch, distTag: manifest.distTag, published: result.published, skipped: result.skipped, sourceSha: manifest.sourceSha, currentBranchSha: expectedCurrentBranchSha, latestPostcondition: process.argv.includes("--publish") ? "verified" : "dry-run", auditRef, authorizationRef };
    writeFileSync(`${artifactDir}.recovery-result.json`, canonicalJson(final));
    console.log(canonicalJson(final).trim());
    return;
  }
  throw new Error("Choose exactly one of --policy, --prepare, --publish-bundle, --validate-recovery-branch, or --recover-bundle");
}

if (import.meta.main) cli().catch((error) => {
  console.error(`release publisher failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
