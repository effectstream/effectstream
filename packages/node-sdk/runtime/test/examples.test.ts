// Examples for the README — verify the public surface resolves.

import { test, expect } from "bun:test";
import * as runtime from "../src/mod.ts";

test("README: init and start are exported as generator functions", () => {
  expect(typeof runtime.init).toBe("function");
  expect(typeof runtime.start).toBe("function");
  expect(typeof runtime.runEffectstream).toBe("function");
  expect(typeof runtime.RunEffectstreamError).toBe("function");
});

test("README: pagination helpers are re-exported", async () => {
  const pagination = await import("../src/api/pagination.ts");
  expect(Object.keys(pagination).length).toBeGreaterThan(0);
});
