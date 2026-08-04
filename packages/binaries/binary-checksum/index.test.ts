import { expect, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyBinaryChecksum } from "./index.js";

const SKIP_VAR = "EFFECTSTREAM_TEST_SKIP_CHECKSUM";

/** Write a temp file and return its path plus its real sha256. */
function fixture(contents: string): { file: string; digest: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "binchk-"));
  const file = path.join(dir, "fake-binary");
  fs.writeFileSync(file, contents);
  const digest = crypto.createHash("sha256").update(contents).digest("hex");
  return { file, digest };
}

const base = {
  packageName: "test-pkg",
  skipEnvVar: SKIP_VAR,
  version: "1.2.3",
};

test("returns the matching platform key when the digest is pinned", () => {
  const { file, digest } = fixture("good binary");
  const matched = verifyBinaryChecksum({
    ...base,
    binaryPath: file,
    checksums: { "linux-x64": "0".repeat(64), "darwin-arm64": digest },
  });
  expect(matched).toBe("darwin-arm64");
});

test("matches on set membership, not on the running platform", () => {
  // The point of the set: a binary whose digest is pinned under some OTHER
  // platform key still passes, because arch detection has historically lied.
  const { file, digest } = fixture("cross platform");
  const matched = verifyBinaryChecksum({
    ...base,
    binaryPath: file,
    checksums: { "some-platform-that-is-not-ours": digest },
  });
  expect(matched).toBe("some-platform-that-is-not-ours");
});

test("throws on a digest that is not pinned", () => {
  const { file } = fixture("tampered binary");
  expect(() =>
    verifyBinaryChecksum({
      ...base,
      binaryPath: file,
      checksums: { "linux-x64": "a".repeat(64) },
    })
  ).toThrow(/checksum mismatch/);
});

test("the mismatch error names the package, the actual digest and the skip var", () => {
  const { file, digest } = fixture("tampered binary");
  try {
    verifyBinaryChecksum({
      ...base,
      binaryPath: file,
      checksums: { "linux-x64": "a".repeat(64) },
    });
    throw new Error("should have thrown");
  } catch (e) {
    const msg = String(e);
    // Whoever hits this in CI needs to know which package, what it got, and
    // how to bypass it, without reading the source.
    expect(msg).toContain("test-pkg");
    expect(msg).toContain(digest);
    expect(msg).toContain(SKIP_VAR);
    expect(msg).toContain("v1.2.3");
  }
});

test("an empty checksum table fails closed rather than accepting anything", () => {
  // A forgotten regeneration after a version bump must not silently downgrade
  // the guard into a no-op.
  const { file } = fixture("unpinned");
  expect(() =>
    verifyBinaryChecksum({ ...base, binaryPath: file, checksums: {} })
  ).toThrow(/no checksums are pinned/);
});

test("the skip env var bypasses verification and returns undefined", () => {
  const { file } = fixture("local build");
  process.env[SKIP_VAR] = "1";
  try {
    const matched = verifyBinaryChecksum({
      ...base,
      binaryPath: file,
      checksums: { "linux-x64": "a".repeat(64) },
    });
    expect(matched).toBeUndefined();
  } finally {
    delete process.env[SKIP_VAR];
  }
});

test("only the exact value 1 bypasses the check", () => {
  // Guard against a truthiness bug making "0" or "false" disable verification.
  const { file } = fixture("local build");
  for (const value of ["0", "false", "", "yes"]) {
    process.env[SKIP_VAR] = value;
    try {
      expect(() =>
        verifyBinaryChecksum({
          ...base,
          binaryPath: file,
          checksums: { "linux-x64": "a".repeat(64) },
        })
      ).toThrow(/checksum mismatch/);
    } finally {
      delete process.env[SKIP_VAR];
    }
  }
});
