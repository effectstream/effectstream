// Guards the zombie failure mode: the `unhandledRejection` handler must crash
// the process for anything it cannot prove survivable. The `survive` handler
// (logs WARN, no exit) is the dangerous branch — if a rejection that escapes
// the effection root were mis-classified as survivable, the whole effection
// tree would be halted while the process stayed alive. These tests pin the
// decision boundary using an injected `onFatal` spy instead of `process.exit`.

import { test, expect } from "bun:test";
import { buildUnhandledRejectionHandler } from "../src/mod.ts";

const fatalSpy = () => {
  const calls: number[] = [];
  return { fn: (code: number) => calls.push(code), calls };
};

test("no shouldSurvive predicate => every rejection is fatal", () => {
  const { fn, calls } = fatalSpy();
  const handle = buildUnhandledRejectionHandler("test-component", undefined, fn);

  handle(new Error("effection root died"));

  expect(calls).toEqual([1]);
});

test("shouldSurvive=false => fatal (process exits)", () => {
  const { fn, calls } = fatalSpy();
  const handle = buildUnhandledRejectionHandler(
    "test-component",
    () => false,
    fn,
  );

  handle(new Error("real logic bug"));

  expect(calls).toEqual([1]);
});

test("shouldSurvive=true => survives (no exit)", () => {
  const { fn, calls } = fatalSpy();
  const handle = buildUnhandledRejectionHandler(
    "test-component",
    () => true,
    fn,
  );

  handle({ code: "ECONNRESET", message: "transient pg blip" });

  expect(calls).toEqual([]);
});

test("predicate decides per-rejection: only the survivable one is spared", () => {
  const { fn, calls } = fatalSpy();
  // Survive only objects carrying a `transient` marker; anything else is fatal.
  const handle = buildUnhandledRejectionHandler(
    "test-component",
    (reason) => Boolean((reason as { transient?: boolean })?.transient),
    fn,
  );

  handle({ transient: true }); // survivable -> no exit
  expect(calls).toEqual([]);

  handle(new Error("generic")); // not survivable -> exit
  expect(calls).toEqual([1]);
});
