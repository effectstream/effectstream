// Examples for the README.

import { test, expect } from "bun:test";
import { generatePrecompile, generatePrecompiles } from "../src/mod.ts";

test("README: generatePrecompile returns a 0x-prefixed 40-hex-char address", () => {
  const addr = generatePrecompile("MY_FEATURE");
  expect(addr).toMatch(/^0x[0-9a-f]{40}$/);
});

test("README: same name always produces the same address", () => {
  expect(generatePrecompile("MY_FEATURE")).toBe(
    generatePrecompile("MY_FEATURE"),
  );
});

test("README: different names produce different addresses", () => {
  expect(generatePrecompile("a")).not.toBe(generatePrecompile("b"));
});

test("README: generatePrecompiles bulk-derives a typed map from a string enum", () => {
  enum MyNames {
    A = "feature-a",
    B = "feature-b",
  }
  const map = generatePrecompiles(MyNames);
  expect(map["feature-a"]).toBe(generatePrecompile("feature-a"));
  expect(map["feature-b"]).toBe(generatePrecompile("feature-b"));
});

test("README: empty enum produces empty map (no throw)", () => {
  const map = generatePrecompiles({} as Record<string, string>);
  expect(Object.keys(map).length).toBe(0);
});
