// Examples for the README.

import { test, expect } from "bun:test";
import { ComponentNames, log, SeverityNumber } from "../src/mod.ts";

test("README: log.local accepts a deferred message function", () => {
  let called = 0;
  log.local(
    "my-app",
    "startup",
    SeverityNumber.INFO,
    (l) => {
      called++;
      l("started on port", 3000);
    },
  );
  // The deferred is invoked synchronously at the appropriate level.
  expect(called).toBe(1);
});

test("README: log.remote accepts the same signature as log.local", () => {
  let called = 0;
  log.remote(
    "my-app",
    "auth",
    SeverityNumber.INFO,
    (l) => {
      called++;
      l("user logged in", { userId: "u_123" });
    },
  );
  expect(called).toBe(1);
});

test("README: log.localForce bypasses level filtering", () => {
  let called = 0;
  log.localForce(
    "my-app",
    "audit",
    SeverityNumber.DEBUG,
    (l) => {
      called++;
      l("low-severity message that would normally be filtered");
    },
  );
  expect(called).toBe(1);
});

test("README: ComponentNames are usable as component tags", () => {
  expect(typeof ComponentNames.EFFECTSTREAM_SYNC).toBe("string");
  expect(typeof ComponentNames.EFFECTSTREAM_RUNTIME).toBe("string");
});
