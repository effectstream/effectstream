// Examples for the README. We exercise Stm in isolation — define a
// grammar, register handlers, and check `.processInput` dispatches to
// the right one. The runtime side (executing yielded SQL) is the job of
// @effectstream/runtime, not this package.

import { test, expect } from "bun:test";
import { Type } from "@sinclair/typebox";
import { StateMachine } from "../Stm.ts";

test("README: StateMachine dispatches inputs to the registered handler", () => {
  const grammar = {
    join: [["user", Type.String()]] as const,
    leave: [["user", Type.String()]] as const,
  } as const;

  const stm = new StateMachine(grammar);
  const calls: string[] = [];

  stm.addStateTransition("join", function* ({ parsedInput }) {
    calls.push(`join:${parsedInput.user}`);
    // Empty generator — no DB writes.
  });
  stm.addStateTransition("leave", function* ({ parsedInput }) {
    calls.push(`leave:${parsedInput.user}`);
  });

  // Build the on-wire concise input.
  const input = JSON.stringify(["join", "alice"]);
  const gen = stm.processInput({
    conciseInput: input,
    blockHeight: 1,
    blockTimestamp: 0,
  } as any);

  // Drain the generator.
  while (!gen.next().done) {}

  expect(calls).toEqual(["join:alice"]);
});

test("README: duplicate prefix registration throws", () => {
  const grammar = { join: [["user", Type.String()]] as const } as const;
  const stm = new StateMachine(grammar);
  stm.addStateTransition("join", function* () {});
  expect(() => stm.addStateTransition("join", function* () {})).toThrow();
});
