import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  STABLE_DIST_TAG,
  compareSemver,
  parseSemver,
  resolveDistTag,
  resolveReleaseVersion,
  setVersionInText,
} from "./publish-bun.effectstream";

describe("parseSemver", () => {
  test("parses and normalizes stable, prerelease, and build forms", () => {
    const parsed = parseSemver("0.105.0-beta.1+build.007");
    expect(parsed.major).toBe(0n);
    expect(parsed.minor).toBe(105n);
    expect(parsed.patch).toBe(0n);
    expect(parsed.prerelease.map((part) => part.raw)).toEqual(["beta", "1"]);
    expect(parsed.build).toEqual(["build", "007"]);
    expect(parsed.normalized).toBe("0.105.0-beta.1+build.007");
  });

  test("strips an optional leading v", () => {
    expect(parseSemver("v1.2.3-rc.1").normalized).toBe("1.2.3-rc.1");
  });

  test("trims surrounding whitespace", () => {
    expect(parseSemver("  0.100.20  ").normalized).toBe("0.100.20");
  });

  test("rejects malformed SemVer without silently normalizing it", () => {
    for (const malformed of [
      "v1.2",
      "1.2.3.4",
      "latest",
      "vv1.2.3",
      "01.2.3",
      "1.02.3",
      "1.2.03",
      "1.2.3-01",
      "1.2.3-alpha..1",
      "1.2.3-alpha_1",
      "1.2.3+build..1",
      "1.2.3-",
      "1.2.3+",
    ]) {
      expect(() => parseSemver(malformed)).toThrow(/valid SemVer/);
    }
  });
});

describe("compareSemver", () => {
  const compare = (a: string, b: string) => compareSemver(parseSemver(a), parseSemver(b));

  test("orders core versions without Number precision loss", () => {
    expect(compare("1.0.0", "0.999.999")).toBeGreaterThan(0);
    expect(compare("0.101.0", "0.100.99")).toBeGreaterThan(0);
    expect(compare("0.100.21", "0.100.20")).toBeGreaterThan(0);
    expect(compare("9007199254740993.0.0", "9007199254740992.999.999")).toBeGreaterThan(0);
    expect(compare("0.100.20", "0.100.20")).toBe(0);
    expect(compare("0.100.19", "0.100.20")).toBeLessThan(0);
  });

  test("implements the canonical prerelease precedence chain", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compare(ordered[i], ordered[i + 1])).toBeLessThan(0);
    }
  });

  test("orders the approved release correctly and ignores build metadata", () => {
    expect(compare("0.105.0-beta.1", "0.104.1")).toBeGreaterThan(0);
    expect(compare("0.105.0-beta.1", "0.105.0")).toBeLessThan(0);
    expect(compare("1.0.0+one", "1.0.0+two")).toBe(0);
  });
});

describe("resolveReleaseVersion", () => {
  test("accepts a greater version and strips the v prefix", () => {
    expect(resolveReleaseVersion("v0.100.20", "0.100.18")).toBe("0.100.20");
  });

  test("accepts a greater version without a prefix", () => {
    expect(resolveReleaseVersion("0.105.0-beta.1", "0.104.1")).toBe("0.105.0-beta.1");
  });

  test("accepts minor and major boundary increments", () => {
    expect(resolveReleaseVersion("0.101.0", "0.100.99")).toBe("0.101.0");
    expect(resolveReleaseVersion("1.0.0", "0.999.999")).toBe("1.0.0");
  });

  test("rejects an equal version", () => {
    expect(() => resolveReleaseVersion("0.100.18", "0.100.18")).toThrow(
      /strictly greater/,
    );
  });

  test("rejects a lower version", () => {
    expect(() => resolveReleaseVersion("v0.100.17", "0.100.18")).toThrow(
      /strictly greater/,
    );
  });

  test("rejects a non-semver tag", () => {
    expect(() => resolveReleaseVersion("v1.2", "0.100.18")).toThrow();
  });

  test("rejects a prerelease that is lower than its stable current version", () => {
    expect(() => resolveReleaseVersion("0.105.0-beta.1", "0.105.0")).toThrow(
      /strictly greater/,
    );
  });
});

describe("resolveDistTag", () => {
  test("maps stable releases only to latest", () => {
    expect(resolveDistTag("0.105.0", STABLE_DIST_TAG)).toBe("latest");
    expect(() => resolveDistTag("0.105.0", "next")).toThrow(/Stable release/);
  });

  test("accepts generic prerelease channels", () => {
    for (const tag of ["next", "beta", "canary", "preview.2", "rc-1", "xray", "x-canary"]) {
      expect(resolveDistTag("0.105.0-beta.1", tag)).toBe(tag);
    }
  });

  test("rejects lower-, upper-, mixed-, and qualified npm wildcard ranges", () => {
    for (const tag of [
      "x",
      "X",
      "x.x",
      "X.X.X",
      "x.1",
      "X.1.2",
      "x.x.1",
      "X.1.x",
      "x.1.x",
      "x.x.x-beta",
      "X.1.2-rc.1",
    ]) {
      expect(() => resolveDistTag("0.105.0-beta.1", tag)).toThrow(
        /npm wildcard SemVer ranges are not allowed/,
      );
    }
  });

  test("rejects prerelease latest and a missing tag", () => {
    expect(() => resolveDistTag("0.105.0-beta.1", STABLE_DIST_TAG)).toThrow(
      /must not use dist-tag latest/,
    );
    expect(() => resolveDistTag("0.105.0-beta.1")).toThrow(/--dist-tag is required/);
    expect(() => resolveDistTag("0.105.0-beta.1", "")).toThrow(/--dist-tag is required/);
  });

  test("rejects whitespace and invalid npm tag characters", () => {
    for (const tag of [" next", "next ", "next tag", "next/tag", "next+tag", "@next"]) {
      expect(() => resolveDistTag("0.105.0-beta.1", tag)).toThrow(/Invalid dist-tag/);
    }
  });

  test("rejects digit- and v-prefixed SemVer-like tags", () => {
    for (const tag of ["1.2.3", "9beta", "v1", "version", "Vnext"]) {
      expect(() => resolveDistTag("0.105.0-beta.1", tag)).toThrow(
        /must not begin with a digit or v/,
      );
    }
  });
});

describe("CLI release guard", () => {
  const root = join(import.meta.dir, "..");
  const script = join(import.meta.dir, "publish-bun.effectstream.ts");

  async function runGuard(args: string[]) {
    const packageBefore = readFileSync(join(root, "package.json"), "utf8");
    const statusBefore = Bun.spawnSync(["git", "status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: root,
    }).stdout.toString();
    const child = Bun.spawn([process.execPath, script, ...args], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(packageBefore);
    expect(
      Bun.spawnSync(["git", "status", "--porcelain=v1", "--untracked-files=all"], {
        cwd: root,
      }).stdout.toString(),
    ).toBe(statusBefore);
    return { exitCode, output: stdout + stderr };
  }

  test("missing dist-tag rejects before any package mutation", async () => {
    const result = await runGuard(["--release-version", "0.105.0-beta.1"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("--dist-tag is required");
  });

  test("prerelease paired with latest rejects before any package mutation", async () => {
    const result = await runGuard([
      "--release-version",
      "0.105.0-beta.1",
      "--dist-tag",
      "latest",
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("must not use dist-tag latest");
  });

  test("stable release paired with a non-latest tag rejects before mutation", async () => {
    const result = await runGuard([
      "--release-version",
      "0.105.0",
      "--dist-tag",
      "next",
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("must use dist-tag latest");
  });

  test("invalid npm tags reject before any package mutation", async () => {
    for (const tag of [" next", "next/tag", "1.2.3", "v1"]) {
      const result = await runGuard([
        "--release-version",
        "0.105.0-beta.1",
        "--dist-tag",
        tag,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("Invalid dist-tag");
    }
  });

  test("npm wildcard ranges reject before any package mutation", async () => {
    for (const tag of ["x", "X", "x.1", "X.1.2", "x.x.x-beta"]) {
      const result = await runGuard([
        "--release-version",
        "0.105.0-beta.1",
        "--dist-tag",
        tag,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("npm wildcard SemVer ranges are not allowed");
    }
  });
});

describe("release workflow", () => {
  test("pins privileged actions/tools and verifies source identity before mutation", () => {
    const workflow = readFileSync(join(import.meta.dir, "workflows", "release.yaml"), "utf8");
    expect(workflow).toContain(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
    );
    expect(workflow).toContain(
      "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2",
    );
    expect(workflow).toContain("bun-version: 1.4.0");
    expect(workflow).not.toContain("bun-version: latest");
    expect(workflow).toContain("runs-on: ubuntu-22.04");
    expect(workflow).toContain("ref: ${{ github.event.release.tag_name }}");
    expect(workflow).toContain("RELEASE_TARGET_COMMITISH: ${{ github.event.release.target_commitish }}");
    expect(workflow).toContain(
      "affd55aab609d4db7d6c6f38925859586d1ce67fd50f790d97c5dc027214af11",
    );
    expect(workflow).toContain("bash .github/verify-release-source.sh");
    expect(workflow).toContain("git push origin HEAD:refs/heads/v-next");
    expect(workflow).not.toContain("git push origin v-next");

    const ordered = [
      "Verify immutable release source identity",
      "Setup Bun",
      "Install dependencies",
      "Configure npm auth",
      "Select release channel",
      "name: Publish",
      "git add package.json",
    ].map((needle) => workflow.indexOf(needle));
    expect(ordered.every((position) => position >= 0)).toBe(true);
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });

  test("maps GitHub prerelease metadata to a generic explicit publisher channel", () => {
    const workflow = readFileSync(join(import.meta.dir, "workflows", "release.yaml"), "utf8");
    const channelStart = workflow.indexOf("- name: Select release channel");
    const channelEnd = workflow.indexOf("- name: Publish", channelStart);
    const channelBlock = workflow.slice(channelStart, channelEnd);

    expect(channelStart).toBeGreaterThanOrEqual(0);
    expect(channelEnd).toBeGreaterThan(channelStart);
    expect(channelBlock).toContain("PRERELEASE: ${{ github.event.release.prerelease }}");
    expect(channelBlock).toContain('[[ "$PRERELEASE" == "true" ]]');
    expect(channelBlock).toContain('DIST_TAG="next"');
    expect(channelBlock).toContain('DIST_TAG="latest"');
    expect(channelBlock).not.toContain("github.event.release.tag_name");
    expect(channelBlock).not.toContain("RELEASE_TAG");
    expect(workflow).toContain('--dist-tag "${{ steps.release-channel.outputs.dist-tag }}"');
  });
});

describe("setVersionInText", () => {
  test("changes only the version line, preserving exact formatting", () => {
    const src = [
      "{",
      '  "name": "@effectstream/node-sdk",',
      '  "version": "0.100.17",',
      '  "peerDependenciesMeta": {',
      '    "@effectstream/example": { "optional": true }',
      "  }",
      "}",
      "",
    ].join("\n");
    const out = setVersionInText(src, "0.100.20");
    expect(out).toBe(src.replace("0.100.17", "0.100.20"));
    // Compact object formatting is untouched.
    expect(out).toContain('{ "optional": true }');
  });

  test("only the first (package) version is replaced", () => {
    const src = '{ "version": "0.100.17", "engines": { "version": "x" } }';
    expect(setVersionInText(src, "0.100.20")).toBe(
      '{ "version": "0.100.20", "engines": { "version": "x" } }',
    );
  });
});
