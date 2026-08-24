import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  LEDGER_V9_DIST_TAG,
  STABLE_DIST_TAG,
  compareSemver,
  parseSemver,
  resolveDistTag,
  resolveReleaseVersion,
  setVersionInText,
} from "./publish-bun.effectstream";

describe("parseSemver", () => {
  test("parses and normalizes stable, prerelease, and build forms", () => {
    const parsed = parseSemver("0.105.0-v9.0+build.007");
    expect(parsed.major).toBe(0n);
    expect(parsed.minor).toBe(105n);
    expect(parsed.patch).toBe(0n);
    expect(parsed.prerelease.map((part) => part.raw)).toEqual(["v9", "0"]);
    expect(parsed.build).toEqual(["build", "007"]);
    expect(parsed.normalized).toBe("0.105.0-v9.0+build.007");
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
    expect(compare("0.105.0-v9.0", "0.104.1")).toBeGreaterThan(0);
    expect(compare("0.105.0-v9.0", "0.105.0")).toBeLessThan(0);
    expect(compare("1.0.0+one", "1.0.0+two")).toBe(0);
  });
});

describe("resolveReleaseVersion", () => {
  test("accepts a greater version and strips the v prefix", () => {
    expect(resolveReleaseVersion("v0.100.20", "0.100.18")).toBe("0.100.20");
  });

  test("accepts a greater version without a prefix", () => {
    expect(resolveReleaseVersion("0.105.0-v9.0", "0.104.1")).toBe("0.105.0-v9.0");
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
    expect(() => resolveReleaseVersion("0.105.0-v9.0", "0.105.0")).toThrow(
      /strictly greater/,
    );
  });
});

describe("resolveDistTag", () => {
  test("maps stable releases only to latest", () => {
    expect(resolveDistTag("0.105.0", STABLE_DIST_TAG)).toBe("latest");
    expect(() => resolveDistTag("0.105.0", LEDGER_V9_DIST_TAG)).toThrow(/Stable release/);
  });

  test("maps only the approved -v9.* prerelease line to ledger-v9", () => {
    expect(resolveDistTag("0.105.0-v9.0", LEDGER_V9_DIST_TAG)).toBe("ledger-v9");
    expect(resolveDistTag("v0.105.0-v9.1.rc.2", LEDGER_V9_DIST_TAG)).toBe("ledger-v9");
    expect(() => resolveDistTag("0.105.0-v9", LEDGER_V9_DIST_TAG)).toThrow(
      /approved -v9\.\*/,
    );
    expect(() => resolveDistTag("0.105.0-alpha.1", LEDGER_V9_DIST_TAG)).toThrow(
      /approved -v9\.\*/,
    );
  });

  test("rejects prerelease latest, missing, unknown, and SemVer-like tags", () => {
    expect(() => resolveDistTag("0.105.0-v9.0", STABLE_DIST_TAG)).toThrow(
      /must not use dist-tag latest/,
    );
    expect(() => resolveDistTag("0.105.0-v9.0")).toThrow(/--dist-tag is required/);
    for (const tag of ["next", "beta", "v9", "v9.0", "1.2.3", " ledger-v9"] ) {
      expect(() => resolveDistTag("0.105.0-v9.0", tag)).toThrow();
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
    const result = await runGuard(["--release-version", "0.105.0-v9.0"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("--dist-tag is required");
  });

  test("prerelease paired with latest rejects before any package mutation", async () => {
    const result = await runGuard([
      "--release-version",
      "0.105.0-v9.0",
      "--dist-tag",
      "latest",
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("must not use dist-tag latest");
  });
});

describe("release workflow", () => {
  test("passes an explicit fail-closed channel to the publisher", () => {
    const workflow = readFileSync(join(import.meta.dir, "workflows", "release.yaml"), "utf8");
    expect(workflow).toContain('DIST_TAG="ledger-v9"');
    expect(workflow).toContain('DIST_TAG="latest"');
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
      '    "@midnight-ntwrk/ledger-v8": { "optional": true }',
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
