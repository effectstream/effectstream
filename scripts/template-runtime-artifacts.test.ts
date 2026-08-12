import { describe, expect, test } from "bun:test";
import {
  auditLockText,
  auditLockPresence,
  auditPackageJson,
  isMutableUrl,
  validateManifest,
  type ArtifactManifest,
} from "./template-runtime-artifacts.ts";

const validManifest: ArtifactManifest = {
  schemaVersion: 1,
  templateBaselineVersion: "1.2.3",
  defaultProfile: "all",
  platforms: ["linux-amd64"],
  artifacts: [{
    id: "tool",
    version: "1.0.0",
    platform: "linux-amd64",
    profiles: ["templates"],
    url: "https://example.com/releases/1.0.0/tool.zip",
    sha256: "a".repeat(64),
    archiveType: "zip",
    extractedPath: "tool",
    executable: "tool",
    executableSha256: "b".repeat(64),
    consumers: ["fixture"],
    phase: "first-run",
    license: "MIT",
  }],
};

describe("artifact manifest audit", () => {
  test("accepts a pinned artifact", () => {
    expect(validateManifest(validManifest)).toEqual([]);
  });

  test("rejects floating tags and missing checksums", () => {
    const manifest = structuredClone(validManifest);
    manifest.artifacts[0].url = "https://example.com/releases/latest/tool.zip";
    manifest.artifacts[0].sha256 = "";
    expect(validateManifest(manifest).map((finding) => finding.code)).toContainAllValues([
      "mutable-url",
      "invalid-checksum",
    ]);
  });

  test("rejects duplicate id/version/platform", () => {
    const manifest = structuredClone(validManifest);
    manifest.artifacts.push(structuredClone(manifest.artifacts[0]));
    expect(validateManifest(manifest).some((finding) => finding.code === "duplicate-artifact")).toBe(true);
  });

  test("validates and deduplicates toolchain downloads", () => {
    const manifest = structuredClone(validManifest);
    manifest.toolchains = [{
      id: "compiler",
      version: "1.0.0",
      platform: "linux-amd64",
      url: "http://example.com/releases/latest/compiler.zip",
      sha256: "invalid",
      executableSha256: "invalid",
      license: "MIT",
    }];
    manifest.toolchains.push(structuredClone(manifest.toolchains[0]));
    const codes = validateManifest(manifest).map((finding) => finding.code);
    for (const code of [
      "duplicate-toolchain",
      "invalid-checksum",
      "mutable-url",
      "insecure-url",
    ]) {
      expect(codes).toContain(code);
    }
  });
});

describe("template dependency audit", () => {
  const publishable = new Set(["@effectstream/runtime"]);

  test("detects floating and skewed EffectStream pins", () => {
    const floating = auditPackageJson(
      { dependencies: { "@effectstream/runtime": "*" } },
      "1.2.3",
      publishable,
    );
    expect(floating[0].code).toBe("floating-effectstream-dependency");
    const skewed = auditPackageJson(
      { devDependencies: { "@effectstream/runtime": "1.2.2" } },
      "1.2.3",
      publishable,
    );
    expect(skewed[0].code).toBe("effectstream-version-skew");
  });

  test("detects download-capable lifecycle scripts", () => {
    const findings = auditPackageJson(
      { name: "fixture", scripts: { postinstall: "node download.js" } },
      "1.2.3",
      publishable,
    );
    expect(findings[0].code).toBe("lifecycle-download-risk");
  });

  test("detects a missing root lockfile", () => {
    expect(auditLockPresence(false, "fixture/bun.lock")[0]).toMatchObject({
      code: "missing-lockfile",
      file: "fixture/bun.lock",
    });
  });

  test("reports platform packages and npm aliases from locks", () => {
    const findings = auditLockText(`
      "@esbuild/linux-x64": ["@esbuild/linux-x64@1.0.0"]
      "@txpipe/dolos": ["@txpipe/dolos@npm:1.2.0"]
    `);
    expect(findings.map((finding) => finding.message)).toContainAllValues([
      "lock contains @esbuild/linux-",
      "lock contains @txpipe/dolos",
    ]);
  });

  test("recognizes mutable URL forms", () => {
    expect(isMutableUrl("https://x/releases/latest/a.zip")).toBe(true);
    expect(isMutableUrl("https://x/releases/1.2.3/a.zip")).toBe(false);
  });
});
