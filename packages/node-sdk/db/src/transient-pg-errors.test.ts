import { test, expect } from "bun:test";
import { isTransientPgError } from "./transient-pg-errors.ts";

test("isTransientPgError - Neon pg-pool TLS reset", () => {
  expect(
    isTransientPgError({
      code: "ECONNRESET",
      message:
        "Client network socket disconnected before secure TLS connection was established",
      stack: "    at /app/node_modules/.bun/pg-pool@3.14.0/node_modules/pg-pool/index.js:45:11",
    }),
  ).toBe(true);
});

test("isTransientPgError - rejects non-pg ETIMEDOUT", () => {
  expect(
    isTransientPgError({
      code: "ETIMEDOUT",
      message: "fetch failed",
      stack: "    at node:internal/deps/undici/undici.js:1234:5",
    }),
  ).toBe(false);
});

test("isTransientPgError - walks cause chain", () => {
  const inner = {
    code: "ECONNRESET",
    message:
      "Client network socket disconnected before secure TLS connection was established",
    stack: "    at node_modules/pg-pool/index.js:45:11",
  };
  expect(isTransientPgError({ message: "wrapper", cause: inner })).toBe(true);
});

test("isTransientPgError - rejects logic errors", () => {
  expect(isTransientPgError(new Error("column foo does not exist"))).toBe(
    false,
  );
});

test("isTransientPgError - idle pool message without stack", () => {
  expect(
    isTransientPgError({
      message: "Connection terminated unexpectedly",
    }),
  ).toBe(true);
});
