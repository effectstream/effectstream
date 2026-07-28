// Pins the PRODUCTION wiring used in pg-connection.ts:
//   installUnhandledRejectionLogger(EFFECTSTREAM_PGLITE, isTransientPgError)
// i.e. the live `unhandledRejection` handler treats `isTransientPgError` as its
// survive predicate. This is the test @acedward asked for: prove that when
// something other than a known-transient pg error escapes to the global
// handler (e.g. a generic error torn out of the effection root), the process is
// actually told to exit — it does NOT silently log-and-survive into a zombie
// whose effection tree is dead but whose process is still up.

import { test, expect } from "bun:test";
import { buildUnhandledRejectionHandler } from "@effectstream/log";
import { isTransientPgError } from "./transient-pg-errors.ts";

const wireProductionHandler = () => {
  const exits: number[] = [];
  const handle = buildUnhandledRejectionHandler(
    "pglite",
    isTransientPgError,
    (code) => exits.push(code),
  );
  return { handle, exits };
};

test("generic error escaping the effection root is fatal (no zombie)", () => {
  const { handle, exits } = wireProductionHandler();

  // What a halted effection scope surfaces: an ordinary Error, not a pg error.
  handle(new Error("effection root task died"));

  expect(exits).toEqual([1]);
});

test("a logic/SQL bug is fatal", () => {
  const { handle, exits } = wireProductionHandler();
  handle(new Error("column foo does not exist"));
  expect(exits).toEqual([1]);
});

test("a genuine transient pg blip survives (the intended exemption)", () => {
  const { handle, exits } = wireProductionHandler();

  handle({
    code: "ECONNRESET",
    message:
      "Client network socket disconnected before secure TLS connection was established",
    stack: "    at node_modules/pg-pool/index.js:45:11",
  });

  expect(exits).toEqual([]);
});

test("a non-pg ECONNRESET-shaped rejection is still fatal", () => {
  const { handle, exits } = wireProductionHandler();

  // Same code, but not from the pg stack => isTransientPgError returns false.
  handle({
    code: "ETIMEDOUT",
    message: "fetch failed",
    stack: "    at node:internal/deps/undici/undici.js:1234:5",
  });

  expect(exits).toEqual([1]);
});
