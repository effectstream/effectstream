import { describe, expect, test } from "bun:test";
import {
  compareSemver,
  parseSemver,
  resolveReleaseVersion,
  setVersionInText,
} from "./publish-bun.effectstream";

describe("parseSemver", () => {
  test("parses plain MAJOR.MINOR.PATCH", () => {
    expect(parseSemver("0.100.20")).toEqual([0, 100, 20]);
  });

  test("strips an optional leading v", () => {
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
  });

  test("trims surrounding whitespace", () => {
    expect(parseSemver("  0.100.20  ")).toEqual([0, 100, 20]);
  });

  test("throws on non-semver input", () => {
    expect(() => parseSemver("v1.2")).toThrow();
    expect(() => parseSemver("1.2.3.4")).toThrow();
    expect(() => parseSemver("latest")).toThrow();
  });
});

describe("compareSemver", () => {
  test("orders by major, then minor, then patch", () => {
    expect(compareSemver([1, 0, 0], [0, 999, 999])).toBeGreaterThan(0);
    expect(compareSemver([0, 101, 0], [0, 100, 99])).toBeGreaterThan(0);
    expect(compareSemver([0, 100, 21], [0, 100, 20])).toBeGreaterThan(0);
    expect(compareSemver([0, 100, 20], [0, 100, 20])).toBe(0);
    expect(compareSemver([0, 100, 19], [0, 100, 20])).toBeLessThan(0);
  });
});

describe("resolveReleaseVersion", () => {
  test("accepts a greater version and strips the v prefix", () => {
    expect(resolveReleaseVersion("v0.100.20", "0.100.18")).toBe("0.100.20");
  });

  test("accepts a greater version without a prefix", () => {
    expect(resolveReleaseVersion("0.100.20", "0.100.18")).toBe("0.100.20");
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
