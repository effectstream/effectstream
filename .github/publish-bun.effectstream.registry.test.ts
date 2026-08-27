import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  canonicalJson,
  publishFromBundle,
  readAndVerifyBundle,
  readRegistryState,
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
let publishAttempts = 0;
let failPublishAttempt = 0;
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
      `${JSON.stringify({ name, version: "0.104.2", files: ["index.js", "README.md"] }, null, 2)}\n`,
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
      const url = new URL(request.url);
      const distTagMatch = /^\/-\/package\/(.+)\/dist-tags\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PUT" && distTagMatch) {
        const name = decodeURIComponent(distTagMatch[1]);
        const tag = decodeURIComponent(distTagMatch[2]);
        const version = await request.json() as string;
        distTags.set(name, { ...(distTags.get(name) ?? {}), [tag]: version });
        return Response.json({ ok: true });
      }
      if (request.method === "PUT") {
        publishAttempts++;
        if (failPublishAttempt && publishAttempts === failPublishAttempt) {
          return Response.json({ error: "injected first-publish failure" }, { status: 500 });
        }
        const document = await request.json() as any;
        const name = document.name ?? document._id;
        const version = Object.keys(document.versions ?? {})[0];
        const integrity = document.versions?.[version]?.dist?.integrity;
        if (!name || !version || !integrity) return Response.json({ error: "invalid publish" }, { status: 400 });
        if (occupied.has(name)) return Response.json({ error: "conflict" }, { status: 409 });
        occupied.set(name, integrity);
        distTags.set(name, { ...(distTags.get(name) ?? {}), ...(document["dist-tags"] ?? {}) });
        return Response.json({ ok: true }, { status: 201 });
      }
      const name = decodeURIComponent(url.pathname.slice(1));
      if (unqueryable.has(name)) return Response.json({ error: "unavailable" }, { status: 503 });
      const integrity = occupied.get(name);
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
    expect(readAndVerifyBundle(bundle).packages).toHaveLength(39);
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

  test("publishes exact tarballs, stops on first failure, then completes from a downloaded copy", async () => {
    if (crossRunPhase === "consumer") {
      if (!crossRunDir) throw new Error("consumer requires EFFECTSTREAM_CROSS_RUN_DIR");
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
      process.env.NPM_TOKEN = "fake-test-token";
      process.env.BUN_AUTH_TOKEN = "fake-test-token";
      process.env.NPM_CONFIG_TOKEN = "fake-test-token";
      const npmrc = join(import.meta.dir, "..", ".npmrc");
      writeFileSync(npmrc, `//127.0.0.1:${port}/:_authToken=fake-test-token\n`);
      const result = await publishFromBundle({ artifactDir: downloaded, registry, recovery: true, publish: true });
      expect(result.skipped).toHaveLength(5);
      expect(result.published).toHaveLength(34);
      expect(occupied.size).toBe(39);
      delete process.env.NPM_TOKEN;
      delete process.env.BUN_AUTH_TOKEN;
      delete process.env.NPM_CONFIG_TOKEN;
      rmSync(npmrc, { force: true });
      return;
    }

    occupied.clear();
    for (const name of manifest.packages.map((pkg) => pkg.name)) distTags.set(name, { latest: "0.200.2" });
    publishAttempts = 0;
    failPublishAttempt = 6;
    process.env.NPM_TOKEN = "fake-test-token";
    process.env.BUN_AUTH_TOKEN = "fake-test-token";
    process.env.NPM_CONFIG_TOKEN = "fake-test-token";
    const npmrc = join(import.meta.dir, "..", ".npmrc");
    writeFileSync(npmrc, `//127.0.0.1:${port}/:_authToken=fake-test-token\n`);
    await expect(
      publishFromBundle({ artifactDir: bundle, registry, recovery: false, publish: true }),
    ).rejects.toThrow(/stopping/);
    expect(occupied.size).toBe(5);

    if (crossRunPhase === "producer") {
      if (!crossRunDir) throw new Error("producer requires EFFECTSTREAM_CROSS_RUN_DIR");
      rmSync(join(crossRunDir, "artifact"), { recursive: true, force: true });
      rmSync(join(crossRunDir, "registry-state.json"), { force: true });
      cpSync(bundle, join(crossRunDir, "artifact"), { recursive: true });
      writeFileSync(
        join(crossRunDir, "registry-state.json"),
        canonicalJson({ occupied: [...occupied], distTags: [...distTags] }),
      );
      delete process.env.NPM_TOKEN;
      delete process.env.BUN_AUTH_TOKEN;
      delete process.env.NPM_CONFIG_TOKEN;
      rmSync(npmrc, { force: true });
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
    });
    expect(result.skipped).toHaveLength(5);
    expect(result.published).toHaveLength(34);
    expect(occupied.size).toBe(39);
    for (const pkg of manifest.packages) {
      expect(occupied.get(pkg.name)).toBe(pkg.integrity);
      expect(distTags.get(pkg.name)).toEqual({ latest: "0.200.2", "midnight-1": "0.104.2" });
    }
    const completeRetry = await publishFromBundle({
      artifactDir: downloaded,
      registry,
      recovery: true,
      publish: false,
    });
    expect(completeRetry.published).toEqual([]);
    expect(completeRetry.skipped).toHaveLength(39);
    delete process.env.NPM_TOKEN;
    delete process.env.BUN_AUTH_TOKEN;
    delete process.env.NPM_CONFIG_TOKEN;
    rmSync(npmrc, { force: true });
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
});
