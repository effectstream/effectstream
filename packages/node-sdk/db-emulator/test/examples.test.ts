// Examples for the README — verify the public surface resolves.

import { test, expect } from "bun:test";
import { standAloneApplyMigrations } from "../mod.ts";

test("README: standAloneApplyMigrations is exported as a function", () => {
  expect(typeof standAloneApplyMigrations).toBe("function");
});
