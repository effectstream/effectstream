import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  canonicalJson,
  pollRegistryPostconditions,
  publishFromBundle,
  readAndVerifyBundle,
  readRegistryState,
  RegistryVisibilityTimeoutError,
  type ReleaseManifest,
} from "./publish-bun.effectstream";

const port = Number(process.env.EFFECTSTREAM_TEST_REGISTRY_PORT ?? "15432");
const registry = `http://127.0.0.1:${port}`;
const root = mkdtempSync(join(tmpdir(), "effectstream-registry-test-"));
const bundle = join(root, "bundle");
const crossRunDir = process.env.EFFECTSTREAM_CROSS_RUN_DIR;
const crossRunPhase = process.env.EFFECTSTREAM_CROSS_RUN_PHASE;
const occupied = new Map<string, string>();
const distTags = new Map<string, Record<string, string>>();
const unqueryable = new Set<string>();
const hiddenReads = new Map<string, number>();
const uploaded = new Map<string, { metadata: any; attachment: Uint8Array }>();
const authorizationHeaders: string[] = [];
let publishAttempts = 0;
let failPublishAttempt = 0;
let directTagRequests = 0;
let oidcIdentityRequests = 0;
let oidcExchangeRequests = 0;
let registryRequests = 0;
let server: ReturnType<typeof Bun.serve>;
let manifest: ReleaseManifest;

function digest(bytes: Uint8Array) {
  const value = createHash("sha512").update(bytes).digest();
  return { hex: value.toString("hex"), integrity: `sha512-${value.toString("base64")}` };
}

beforeAll(() => {
  mkdirSync(join(bundle, "tarballs"), { recursive: true });
  const packages = Array.from({ length: 39 }, (_, index) => {
    const name = `@effectstream/fake-${String(index).padStart(2, "0")}`;
    const filename = `fake-${index}.tgz`;
    const packageDir = join(root, `package-${index}`);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, "package.json"),
      `${JSON.stringify({
        name,
        version: "0.104.2",
        files: ["index.js", "README.md"],
        repository: {
          type: "git",
          url: "https://github.com/effectstream/effectstream",
          directory: `packages/fake-${index}`,
        },
      }, null, 2)}\n`,
    );
    writeFileSync(join(packageDir, "index.js"), `export const exact = ${index};\n`);
    writeFileSync(join(packageDir, "README.md"), `# ${name}\n\nExact persisted tarball fixture.\n`);
    const packed = Bun.spawnSync([
      "bun",
      "pm",
      "pack",
      "--filename",
      join(bundle, "tarballs", filename),
      "--quiet",
    ], { cwd: packageDir });
    if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
    const bytes = readFileSync(join(bundle, "tarballs", filename));
    const sum = digest(bytes);
    distTags.set(name, { latest: "0.200.2" });
    return {
      name,
      relativeDir: `packages/fake-${index}`,
      filename,
      size: statSync(join(bundle, "tarballs", filename)).size,
      sha512: sum.hex,
      integrity: sum.integrity,
      versionBefore: "0.104.1",
    };
  });
  manifest = {
    schemaVersion: 1,
    releaseTag: "v0.104.2",
    version: "0.104.2",
    sourceSha: "a".repeat(40),
    branch: "midnight-1",
    distTag: "midnight-1",
    prerelease: false,
    kind: "maintenance-stable",
    workflow: { runId: "producer-1", runAttempt: "1" },
    toolchain: { bun: "1.4.0", platform: "linux-x64" },
    latestBefore: Object.fromEntries(packages.map((pkg) => [pkg.name, "0.200.2"])),
    packages,
  };
  writeFileSync(join(bundle, "manifest.json"), canonicalJson(manifest));
  server = Bun.serve({
    port,
    async fetch(request) {
      registryRequests++;
      const authorization = request.headers.get("authorization");
      if (authorization) authorizationHeaders.push(authorization);
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/-/github/oidc") {
        oidcIdentityRequests++;
        expect(url.searchParams.get("audience")).toBe("npm:127.0.0.1");
        return Response.json({ value: "test-header.test-payload.test-signature" });
      }
      if (request.method === "POST" && url.pathname.startsWith("/-/npm/v1/oidc/token/exchange/package/")) {
        oidcExchangeRequests++;
        return Response.json({ token: "registry-short-lived-oidc-token" });
      }
      const distTagMatch = /^\/-\/package\/(.+)\/dist-tags\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PUT" && distTagMatch) {
        directTagRequests++;
        const name = decodeURIComponent(distTagMatch[1]);
        const tag = decodeURIComponent(distTagMatch[2]);
        const version = await request.json() as string;
        distTags.set(name, { ...(distTags.get(name) ?? {}), [tag]: version });
        return Response.json({ ok: true });
      }
      if (request.method === "PUT") {
        publishAttempts++;
        if (failPublishAttempt && publishAttempts === failPublishAttempt) {
          return Response.json({ error: "injected first-publish failure" }, { status: 400 });
        }
        const document = await request.json() as any;
        const name = document.name ?? document._id;
        const version = Object.keys(document.versions ?? {})[0];
        const integrity = document.versions?.[version]?.dist?.integrity;
        if (!name || !version || !integrity) return Response.json({ error: "invalid publish" }, { status: 400 });
        if (occupied.has(name)) return Response.json({ error: "conflict" }, { status: 409 });
        occupied.set(name, integrity);
        distTags.set(name, { ...(distTags.get(name) ?? {}), ...(document["dist-tags"] ?? {}) });
        const attachment = Object.values(document._attachments ?? {})[0] as { data?: string } | undefined;
        uploaded.set(name, {
          metadata: document.versions[version],
          attachment: Uint8Array.from(Buffer.from(attachment?.data ?? "", "base64")),
        });
        return Response.json({ ok: true }, { status: 201 });
      }
      const name = decodeURIComponent(url.pathname.slice(1));
      if (unqueryable.has(name)) return Response.json({ error: "unavailable" }, { status: 503 });
      const hidden = hiddenReads.get(name) ?? 0;
      if (hidden > 0) hiddenReads.set(name, hidden - 1);
      const integrity = hidden > 0 ? undefined : occupied.get(name);
      return Response.json({
        "dist-tags": distTags.get(name) ?? { latest: "0.200.2" },
        versions: integrity ? { "0.104.2": { dist: { integrity } } } : {},
      });
    },
  });
});

afterAll(() => {
  server?.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("persisted bundle verification and lost-runner recovery", () => {
  test("verifies every exact byte and plans all-absent ordinary publication", async () => {
    const verified = readAndVerifyBundle(bundle);
    expect(verified.schemaVersion).toBe(1);
    expect(verified.toolchain).toEqual({ bun: "1.4.0", platform: "linux-x64" });
    expect(verified.packages).toHaveLength(39);
    const result = await publishFromBundle({
      artifactDir: bundle,
      registry,
      recovery: false,
      publish: false,
    });
    expect(result.published).toHaveLength(39);
    expect(result.skipped).toEqual([]);
  });

  test("an independent recovery process skips exact non-prefix occupancy", async () => {
    occupied.clear();
    for (const index of [1, 8, 25]) {
      const pkg = manifest.packages[index];
      occupied.set(pkg.name, pkg.integrity);
      distTags.set(pkg.name, { latest: "0.200.2", "midnight-1": manifest.version });
    }
    const result = await publishFromBundle({
      artifactDir: bundle,
      registry,
      recovery: true,
      publish: false,
    });
    expect(result.skipped).toEqual([1, 8, 25].map((index) => manifest.packages[index].name));
    expect(result.published).toHaveLength(36);
  });

  test("version drift fails before the first registry or dist-tag request", async () => {
    const driftBundle = join(root, "version-drift-bundle");
    cpSync(bundle, driftBundle, { recursive: true });
    const repositoryRoot = join(import.meta.dir, "..");
    const actualPackages = [...new Bun.Glob("packages/**/package.json").scanSync({ cwd: repositoryRoot })]
      .map((path) => ({ path, value: JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as { name?: string; private?: boolean } }))
      .filter(({ value }) => value.name && !value.private && value.name !== "@effectstream/explorer")
      .sort((left, right) => left.value.name!.localeCompare(right.value.name!));
    expect(actualPackages).toHaveLength(39);
    const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repositoryRoot }).stdout.toString().trim();
    const packages = manifest.packages.map((pkg, index) => ({
      ...pkg,
      name: actualPackages[index].value.name!,
      relativeDir: actualPackages[index].path.replace(/\/package\.json$/, ""),
    }));
    const driftManifest: ReleaseManifest = {
      ...manifest,
      sourceSha: head,
      packages,
      latestBefore: Object.fromEntries(packages.map((pkg) => [pkg.name, "0.200.2"])),
    };
    for (let index = 0; index < packages.length; index++) {
      const pkg = packages[index];
      const unpacked = join(root, `version-drift-package-${index}`);
      mkdirSync(unpacked);
      const tarball = join(driftBundle, "tarballs", pkg.filename);
      expect(Bun.spawnSync(["tar", "-xzf", tarball, "-C", unpacked]).exitCode).toBe(0);
      const packageJson = join(unpacked, "package", "package.json");
      const data = JSON.parse(readFileSync(packageJson, "utf8"));
      data.name = pkg.name;
      data.repository = {
        type: "git",
        url: "https://github.com/effectstream/effectstream",
        directory: pkg.relativeDir,
      };
      writeFileSync(packageJson, `${JSON.stringify(data, null, 2)}\n`);
      expect(Bun.spawnSync(["tar", "-czf", tarball, "-C", unpacked, "package"]).exitCode).toBe(0);
      const sum = digest(readFileSync(tarball));
      driftManifest.packages[index] = {
        ...pkg,
        size: statSync(tarball).size,
        sha512: sum.hex,
        integrity: sum.integrity,
      };
    }
    writeFileSync(join(driftBundle, "manifest.json"), canonicalJson(driftManifest));
    const manifestSha512 = digest(readFileSync(join(driftBundle, "manifest.json"))).hex;
    const requestsBefore = registryRequests;
    try {
      const proc = Bun.spawn([
        "bun", "run", ".github/publish-bun.effectstream.ts",
        "--recover-bundle", "--publish",
        "--artifact-dir", driftBundle,
        "--manifest-sha512", manifestSha512,
        "--expected-current-branch-sha", head,
        "--recovery-mode", "partial-tag",
        "--audit-ref", "audit:test",
        "--authorization-ref", "G4:test",
        "--registry", registry,
      ], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
      expect(await proc.exited).not.toBe(0);
      expect(await new Response(proc.stderr).text()).toContain("Version drift in recovery branch");
      expect(registryRequests).toBe(requestsBefore);
    } finally {}
  });

  test("publishes exact tarballs, stops on first failure, then completes from a downloaded copy", async () => {
    if (crossRunPhase === "consumer") {
      if (!crossRunDir) throw new Error("consumer requires EFFECTSTREAM_CROSS_RUN_DIR");
      const failedResult = JSON.parse(readFileSync(join(crossRunDir, "ordinary-publish-result.json"), "utf8")) as {
        packages: { status: string }[];
      };
      expect(failedResult.packages.filter((pkg) => pkg.status === "accepted")).toHaveLength(5);
      expect(failedResult.packages.filter((pkg) => pkg.status === "failed")).toHaveLength(1);
      const persisted = JSON.parse(readFileSync(join(crossRunDir, "registry-state.json"), "utf8")) as {
        occupied: [string, string][];
        distTags: [string, Record<string, string>][];
      };
      occupied.clear();
      distTags.clear();
      for (const entry of persisted.occupied) occupied.set(...entry);
      for (const entry of persisted.distTags) distTags.set(...entry);
      const downloaded = join(root, "runner-b-downloaded-artifact");
      cpSync(join(crossRunDir, "artifact"), downloaded, { recursive: true });
      manifest = readAndVerifyBundle(downloaded);
      const result = await publishFromBundle({
        artifactDir: downloaded,
        registry,
        recovery: true,
        publish: true,
        environment: {
          ...process.env,
          GITHUB_ACTIONS: "true",
          ACTIONS_ID_TOKEN_REQUEST_URL: `${registry}/-/github/oidc`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "github-oidc-request-token-value",
        },
      });
      expect(result.skipped).toHaveLength(5);
      expect(result.published).toHaveLength(34);
      expect(occupied.size).toBe(39);
      return;
    }

    occupied.clear();
    for (const name of manifest.packages.map((pkg) => pkg.name)) distTags.set(name, { latest: "0.200.2" });
    publishAttempts = 0;
    failPublishAttempt = 6;
    directTagRequests = 0;
    oidcIdentityRequests = 0;
    oidcExchangeRequests = 0;
    uploaded.clear();
    authorizationHeaders.length = 0;
    const poisonRoot = mkdtempSync(join(tmpdir(), "effectstream-npm-layer-poison-"));
    const poisonHome = join(poisonRoot, "home");
    mkdirSync(poisonHome);
    const npmrc = join(import.meta.dir, "..", ".npmrc");
    writeFileSync(npmrc, `//127.0.0.1:${port}/:_authToken=project-layer-sentinel\n`);
    writeFileSync(join(poisonHome, ".npmrc"), `//127.0.0.1:${port}/:_authToken=user-layer-sentinel\n`);
    await expect(
      publishFromBundle({
        artifactDir: bundle,
        registry,
        recovery: false,
        publish: true,
        environment: {
          ...process.env,
          HOME: poisonHome,
          GITHUB_ACTIONS: "true",
          ACTIONS_ID_TOKEN_REQUEST_URL: `${registry}/-/github/oidc`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "github-oidc-request-token-value",
        },
      }),
    ).rejects.toThrow(/stopping/);
    expect(occupied.size).toBe(5);
    const failedResult = JSON.parse(readFileSync(`${bundle}.publish-result.json`, "utf8")) as {
      packages: { status: string }[];
    };
    expect(failedResult.packages.filter((pkg) => pkg.status === "accepted")).toHaveLength(5);
    expect(failedResult.packages.filter((pkg) => pkg.status === "failed")).toHaveLength(1);

    if (crossRunPhase === "producer") {
      if (!crossRunDir) throw new Error("producer requires EFFECTSTREAM_CROSS_RUN_DIR");
      rmSync(join(crossRunDir, "artifact"), { recursive: true, force: true });
      rmSync(join(crossRunDir, "registry-state.json"), { force: true });
      cpSync(bundle, join(crossRunDir, "artifact"), { recursive: true });
      cpSync(`${bundle}.publish-result.json`, join(crossRunDir, "ordinary-publish-result.json"));
      writeFileSync(
        join(crossRunDir, "registry-state.json"),
        canonicalJson({ occupied: [...occupied], distTags: [...distTags] }),
      );
      rmSync(npmrc, { force: true });
      rmSync(poisonRoot, { recursive: true, force: true });
      return;
    }

    const downloaded = join(root, "independent-downloaded-bundle");
    cpSync(bundle, downloaded, { recursive: true });
    failPublishAttempt = 0;
    const result = await publishFromBundle({
      artifactDir: downloaded,
      registry,
      recovery: true,
      publish: true,
      environment: {
        ...process.env,
        GITHUB_ACTIONS: "true",
        ACTIONS_ID_TOKEN_REQUEST_URL: `${registry}/-/github/oidc`,
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "github-oidc-request-token-value",
      },
    });
    expect(result.skipped).toHaveLength(5);
    expect(result.published).toHaveLength(34);
    expect(occupied.size).toBe(39);
    for (const pkg of manifest.packages) {
      expect(occupied.get(pkg.name)).toBe(pkg.integrity);
      expect(distTags.get(pkg.name)).toEqual({ latest: "0.200.2", "midnight-1": "0.104.2" });
      const upload = uploaded.get(pkg.name)!;
      expect(upload.metadata.name).toBe(pkg.name);
      expect(upload.metadata.version).toBe(manifest.version);
      expect(upload.metadata.repository).toEqual({
        type: "git",
        url: "git+https://github.com/effectstream/effectstream.git",
        directory: pkg.relativeDir,
      });
      expect(digest(upload.attachment).integrity).toBe(pkg.integrity);
    }
    expect(directTagRequests).toBe(0);
    expect(oidcIdentityRequests).toBe(40);
    expect(oidcExchangeRequests).toBe(40);
    expect(authorizationHeaders.join("\n")).not.toContain("sentinel");
    expect(authorizationHeaders).toContain("Bearer github-oidc-request-token-value");
    expect(authorizationHeaders).toContain("Bearer registry-short-lived-oidc-token");
    const completeRetry = await publishFromBundle({
      artifactDir: downloaded,
      registry,
      recovery: true,
      publish: false,
    });
    expect(completeRetry.published).toEqual([]);
    expect(completeRetry.skipped).toHaveLength(39);
    rmSync(npmrc, { force: true });
    rmSync(poisonRoot, { recursive: true, force: true });
  }, 30_000);

  test("tag drift on exact recovery targets rejects before any mutation", async () => {
    occupied.clear();
    publishAttempts = 0;
    directTagRequests = 0;
    const pkg = manifest.packages[0];
    occupied.set(pkg.name, pkg.integrity);
    for (const tagValue of [undefined, "9.9.9"]) {
      distTags.set(pkg.name, {
        latest: "0.200.2",
        ...(tagValue ? { "midnight-1": tagValue } : {}),
      });
      await expect(
        publishFromBundle({ artifactDir: bundle, registry, recovery: true, publish: true }),
      ).rejects.toThrow(/tag drift/i);
      expect(publishAttempts).toBe(0);
      expect(directTagRequests).toBe(0);
    }
  });

  test("disposable registry models delayed visibility, timeout, and terminal reads with fake time", async () => {
    occupied.clear();
    for (const pkg of manifest.packages) {
      occupied.set(pkg.name, pkg.integrity);
      distTags.set(pkg.name, { latest: "0.200.2", "midnight-1": manifest.version });
      hiddenReads.set(pkg.name, 2);
    }
    let time = 0;
    const sleeps: number[] = [];
    await pollRegistryPostconditions(manifest, {
      registry,
      timeoutMs: 1_000,
      initialBackoffMs: 10,
      maxBackoffMs: 20,
      now: () => time,
      sleep: async (ms) => { sleeps.push(ms); time += ms; },
    });
    expect(sleeps).toEqual([10, 20]);

    for (const pkg of manifest.packages) hiddenReads.set(pkg.name, Number.MAX_SAFE_INTEGER);
    time = 0;
    try {
      await pollRegistryPostconditions(manifest, {
        registry,
        timeoutMs: 25,
        initialBackoffMs: 10,
        maxBackoffMs: 20,
        now: () => time,
        sleep: async (ms) => { time += ms; },
      });
      throw new Error("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryVisibilityTimeoutError);
      expect((error as RegistryVisibilityTimeoutError).pending).toHaveLength(39);
    }
    hiddenReads.clear();
    unqueryable.add(manifest.packages[3].name);
    await expect(
      pollRegistryPostconditions(manifest, { registry, timeoutMs: 1_000 }),
    ).rejects.toThrow(/HTTP 503/);
    unqueryable.clear();
  });

  test("rejects ambient global npm config before a publish subprocess or request", async () => {
    occupied.clear();
    publishAttempts = 0;
    const poisonRoot = mkdtempSync(join(tmpdir(), "effectstream-global-npmrc-"));
    const globalConfig = join(poisonRoot, "npmrc");
    writeFileSync(globalConfig, `//127.0.0.1:${port}/:_authToken=global-layer-sentinel\n`);
    await expect(
      publishFromBundle({
        artifactDir: bundle,
        registry,
        recovery: false,
        publish: true,
        environment: { ...process.env, NPM_CONFIG_GLOBALCONFIG: globalConfig },
      }),
    ).rejects.toThrow(/ambient npm config/i);
    expect(publishAttempts).toBe(0);
    rmSync(poisonRoot, { recursive: true, force: true });
  });

  test("timeout evidence marks every accepted-but-pending package and preserves OIDC env", async () => {
    let time = 0;
    const spawned: { argv: string[]; cwd: string; env: Record<string, string> }[] = [];
    const oidcUrl = "https://oidc.example.test/request?exact=%2Fbyte";
    const oidcToken = "oidc-request-token-exact-bytes";
    await expect(
      publishFromBundle({
        artifactDir: bundle,
        registry,
        recovery: false,
        publish: true,
        visibilityTimeoutMs: 25,
        environment: {
          PATH: process.env.PATH,
          ACTIONS_ID_TOKEN_REQUEST_URL: oidcUrl,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: oidcToken,
        },
        dependencies: {
          read: async (_registry, name) => ({ name, targetIntegrity: null, distTags: { latest: "0.200.2" } }),
          spawn: async (argv, execution) => {
            spawned.push({ argv, cwd: execution.cwd, env: execution.env });
            return 0;
          },
          now: () => time,
          sleep: async (ms) => { time += ms; },
        },
      }),
    ).rejects.toBeInstanceOf(RegistryVisibilityTimeoutError);
    expect(spawned).toHaveLength(39);
    expect(spawned[0].argv.at(-1)).toBe(join(bundle, "tarballs", manifest.packages[0].filename));
    expect(spawned.every((attempt) => attempt.env.ACTIONS_ID_TOKEN_REQUEST_URL === oidcUrl)).toBe(true);
    expect(spawned.every((attempt) => attempt.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN === oidcToken)).toBe(true);
    expect(new Set(spawned.map((attempt) => attempt.cwd)).size).toBe(1);
    expect(spawned[0].cwd).not.toBe(join(import.meta.dir, ".."));
    const result = JSON.parse(readFileSync(`${bundle}.publish-result.json`, "utf8")) as {
      packages: { status: string }[];
    };
    expect(result.packages.filter((pkg) => pkg.status === "visibility-timeout")).toHaveLength(39);
    expect(canonicalJson(result)).not.toContain(oidcUrl);
    expect(canonicalJson(result)).not.toContain(oidcToken);
  });

  test("registry integrity mismatch fails closed", async () => {
    occupied.clear();
    occupied.set(manifest.packages[4].name, "sha512-different");
    await expect(
      publishFromBundle({ artifactDir: bundle, registry, recovery: true, publish: false }),
    ).rejects.toThrow(/integrity differs/);
  });

  test("an unqueryable package fails closed", async () => {
    const name = manifest.packages[7].name;
    unqueryable.add(name);
    await expect(readRegistryState(registry, name, manifest.version)).rejects.toThrow(/HTTP 503/);
    unqueryable.delete(name);
  });

  test("tampered, missing, and unrelated artifact files fail closed", () => {
    occupied.clear();
    const target = join(bundle, "tarballs", manifest.packages[0].filename);
    const original = readFileSync(target);
    writeFileSync(target, "tampered");
    expect(() => readAndVerifyBundle(bundle)).toThrow(/size mismatch|digest mismatch/);
    writeFileSync(target, original);
    writeFileSync(join(bundle, "tarballs", "unrelated.txt"), "not allowed");
    expect(() => readAndVerifyBundle(bundle)).toThrow(/unrelated/);
    rmSync(join(bundle, "tarballs", "unrelated.txt"));
  });

  test("embedded package identity is an independent bundle oracle", () => {
    const copied = join(root, "repository-drift-bundle");
    cpSync(bundle, copied, { recursive: true });
    const pkg = manifest.packages[0];
    const unpacked = join(root, "repository-drift-unpacked");
    mkdirSync(unpacked);
    const tarball = join(copied, "tarballs", pkg.filename);
    const extract = Bun.spawnSync(["tar", "-xzf", tarball, "-C", unpacked]);
    expect(extract.exitCode).toBe(0);
    const packageJson = join(unpacked, "package", "package.json");
    const data = JSON.parse(readFileSync(packageJson, "utf8"));
    data.repository.directory = "packages/wrong-directory";
    writeFileSync(packageJson, `${JSON.stringify(data, null, 2)}\n`);
    const repack = Bun.spawnSync(["tar", "-czf", tarball, "-C", unpacked, "package"]);
    expect(repack.exitCode).toBe(0);
    const copiedManifest = JSON.parse(readFileSync(join(copied, "manifest.json"), "utf8")) as ReleaseManifest;
    const sum = digest(readFileSync(tarball));
    copiedManifest.packages[0] = {
      ...copiedManifest.packages[0],
      size: statSync(tarball).size,
      sha512: sum.hex,
      integrity: sum.integrity,
    };
    writeFileSync(join(copied, "manifest.json"), canonicalJson(copiedManifest));
    expect(() => readAndVerifyBundle(copied)).toThrow(/repository.*directory|canonical repository/i);
  });
});
