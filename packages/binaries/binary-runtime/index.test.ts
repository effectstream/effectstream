import { describe, expect, test } from "bun:test";
import path from "node:path";
import runtime from "./index.mjs";

describe("binary runtime paths", () => {
  test("normalizes platform names", () => {
    expect(runtime.platformKey("linux", "x64")).toBe("linux-amd64");
    expect(runtime.platformKey("darwin", "arm64")).toBe("macos-arm64");
  });

  test("external cache is versioned by artifact and platform", () => {
    const result = runtime.binaryPath({
      id: "midnight-node",
      version: "1.0.0",
      executable: "midnight-node",
      legacyDirectory: "/legacy",
      env: { EFFECTSTREAM_BINARY_CACHE_DIR: "/cache" },
      platform: "linux-amd64",
    });
    expect(result).toBe(
      path.join("/cache", "midnight-node", "1.0.0", "linux-amd64", "bin", "midnight-node"),
    );
  });

  test("legacy cache remains the default", () => {
    expect(runtime.binaryPath({
      id: "midnight-node",
      version: "1.0.0",
      executable: "midnight-node",
      legacyDirectory: "/legacy",
      legacyBinaryPath: "/legacy/midnight-node",
      env: {},
    })).toBe("/legacy/midnight-node");
  });

  test("offline mode fails before a download", () => {
    expect(() => runtime.assertDownloadAllowed("midnight-node", {
      EFFECTSTREAM_OFFLINE: "1",
    })).toThrow("EFFECTSTREAM_OFFLINE=1");
  });

  test("shared caches cannot be cleaned at runtime", () => {
    expect(() => runtime.assertCacheCanBeCleaned("midnight-node", {
      EFFECTSTREAM_BINARY_CACHE_DIR: "/cache",
    })).toThrow("refusing to clean shared");
  });
});
