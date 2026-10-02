import { describe, expect, test } from "bun:test";
import {
  compactSelection,
  compactVersion,
  resolveCompactTarget,
  validateCompactSelection,
  type CompactInvocation,
  type CompactRunner,
} from "./compact";

const sequenceRunner = (...results: CompactInvocation[]): {
  calls: string[][];
  run: CompactRunner;
} => {
  const calls: string[][] = [];
  return {
    calls,
    run: (args) => {
      calls.push(args);
      const result = results.shift();
      if (!result) throw new Error("Unexpected Compact invocation");
      return result;
    },
  };
};

describe("Compact template preflight", () => {
  test("reports a missing launcher with exact installation instructions", () => {
    const fixture = sequenceRunner({
      status: null,
      error: Object.assign(new Error("spawn compact ENOENT"), { code: "ENOENT" }),
    });

    expect(() => validateCompactSelection(fixture.run)).toThrow(
      `Compact launcher was not found on PATH.`,
    );
    expect(() => validateCompactSelection(sequenceRunner({
      status: null,
      error: Object.assign(new Error("spawn compact ENOENT"), { code: "ENOENT" }),
    }).run)).toThrow("bun toolchain/compact.ts install");
  });

  test("reports an installed launcher whose selected compiler is missing", () => {
    const fixture = sequenceRunner(
      { status: 0, stdout: "compact 0.5.1\n" },
      { status: 1, stderr: "compiler directory does not exist\n" },
    );

    expect(() => validateCompactSelection(fixture.run)).toThrow(
      `template selection ${compactVersion} is unavailable`,
    );
    expect(fixture.calls).toEqual([
      ["--version"],
      ["compile", compactSelection, "--version"],
    ]);
  });

  test("accepts only the declared selection and returns its compiler report", () => {
    const fixture = sequenceRunner(
      { status: 0, stdout: "compact 0.5.1\n" },
      { status: 0, stdout: "0.33.0\n" },
    );

    expect(validateCompactSelection(fixture.run)).toBe("0.33.0");
    expect(fixture.calls[1]).toEqual([
      "compile",
      compactSelection,
      "--version",
    ]);
  });

  test("maps every supported Docker and desktop platform to a pinned asset", () => {
    expect(resolveCompactTarget("darwin", "arm64")).toBe("aarch64-darwin");
    expect(resolveCompactTarget("darwin", "x64")).toBe("x86_64-darwin");
    expect(resolveCompactTarget("linux", "arm64")).toBe("aarch64-unknown-linux-musl");
    expect(resolveCompactTarget("linux", "x64")).toBe("x86_64-unknown-linux-musl");
    expect(() => resolveCompactTarget("win32", "x64")).toThrow(
      `has no pinned asset for win32/x64`,
    );
  });
});
