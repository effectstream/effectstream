import { expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import { StateMachine, Stm } from "../Stm.ts";

const input = (conciseInput: string) => ({
  conciseInput,
  blockHeight: 1,
  blockTimestamp: 2,
}) as any;

const drain = (stream: Generator) => {
  while (!stream.next().done) {}
};

test("StateMachine is the Stm constructor and chains on the same instance", () => {
  expect(StateMachine).toBe(Stm);

  const grammar = {
    join: [["user", Type.String()]] as const,
    leave: [["reason", Type.String()]] as const,
  } as const;
  const machine = new StateMachine(grammar);
  const calls: string[] = [];

  expect(machine.grammar).toBe(grammar);

  const afterJoin = machine.addStateTransition(
    "join",
    function* ({ parsedInput }) {
      calls.push(`join:${parsedInput.user}`);
    },
  );
  expect(afterJoin).toBe(machine);

  const afterLeave = afterJoin.addStateTransition(
    "leave",
    function* ({ parsedInput }) {
      calls.push(`leave:${parsedInput.reason}`);
    },
  );
  expect(afterLeave).toBe(machine);

  drain(machine.processInput(input(JSON.stringify(["join", "alice"]))));
  expect(calls).toEqual(["join:alice"]);

  drain(machine.processInput(input(JSON.stringify(["leave", "done"]))));
  expect(calls).toEqual(["join:alice", "leave:done"]);
});

test("duplicate transition registration remains rejected", () => {
  const machine = new StateMachine({
    join: [["user", Type.String()]] as const,
  });
  machine.addStateTransition("join", function* () {});

  expect(() => machine.addStateTransition("join", function* () {})).toThrow(
    "duplicate listener for prefix join",
  );
});

test("parse errors and grammar matches without handlers log and return", () => {
  const machine = new StateMachine({
    join: [["user", Type.String()]] as const,
  });
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => errors.push(args);

  try {
    expect(machine.processInput(input("not-json")).next().done).toBe(true);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.[0]).toBe("[STM] Parsing error:");
    expect(errors[1]?.[0]).toBe(
      "[STM] Cannot parse the input with the known grammar:",
    );

    errors.length = 0;
    expect(
      machine
        .processInput(input(JSON.stringify(["join", "alice"])))
        .next().done,
    ).toBe(true);
    expect(errors).toEqual([
      [
        "Grammar match, but no prefix found with corresponding state transition: join",
      ],
    ]);
  } finally {
    console.error = originalError;
  }
});

test("processInput preserves handler yields and propagates handler errors", () => {
  const machine = new StateMachine({
    run: [["value", Type.Number()]] as const,
  });
  const yielded = ["query", { value: 7 }] as any;
  let calls = 0;

  machine.addStateTransition("run", function* ({ parsedInput }) {
    calls += 1;
    expect(parsedInput.value).toBe(7);
    yield yielded;
    throw new Error("handler failure");
  });

  const stream = machine.processInput(input(JSON.stringify(["run", 7])));
  expect(stream.next()).toEqual({ done: false, value: yielded });
  expect(calls).toBe(1);
  expect(() => stream.next()).toThrow("handler failure");
  expect(calls).toBe(1);
});
