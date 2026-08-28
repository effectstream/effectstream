import { expect, spyOn, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import type { BaseStfInput } from "../types.ts";
import { StateMachine, Stm } from "../Stm.ts";

const payloadGrammar = [["payload", Type.Any()]] as const;

function input(conciseInput: string): BaseStfInput {
  return {
    conciseInput,
    blockHeight: 1,
    blockTimestamp: 0,
  } as BaseStfInput;
}

test("fluent registration returns one instance and accumulates two prefixes", () => {
  const stateMachine = new StateMachine();
  const withFirst = stateMachine.addStateTransition("first", function* () {});
  const withSecond = withFirst.addStateTransition("second", function* () {});

  expect(withFirst).toBe(stateMachine);
  expect(withSecond).toBe(stateMachine);
  expect(withSecond.registeredPrefixes).toEqual(["first", "second"]);
});

test("registration rejects duplicate prefixes deterministically", () => {
  const stateMachine = new StateMachine().addStateTransition(
    "round",
    function* () {},
  );

  expect(() =>
    stateMachine.addStateTransition("round", function* () {})
  ).toThrow("duplicate listener for prefix round");
});

test("binding rejects registered prefixes absent from runtime grammar", () => {
  const stateMachine = new StateMachine().addStateTransition(
    "registered",
    function* () {},
  );

  expect(() => stateMachine.bindGrammar([])).toThrow(
    "unknown registered prefix: registered",
  );
});

test("binding rejects configured prefixes without handlers", () => {
  const stateMachine = new StateMachine();

  expect(() =>
    stateMachine.bindGrammar([["configured", payloadGrammar]])
  ).toThrow("missing transition handler: configured");
});

test("binding rejects duplicate configured prefixes before committing grammar", () => {
  const stateMachine = new StateMachine().addStateTransition(
    "round",
    function* () {},
  );

  expect(() =>
    stateMachine.bindGrammar([
      ["round", payloadGrammar],
      ["round", payloadGrammar],
    ])
  ).toThrow("duplicate configured grammar prefix round");
});

test("runtime grammar binding succeeds only once", () => {
  let calls = 0;
  const stateMachine = new StateMachine().addStateTransition(
    "round",
    function* ({ parsedInput }) {
      calls += parsedInput.payload.round;
    },
  );
  const bound = stateMachine.bindGrammar({ round: payloadGrammar });

  expect(bound).toBe(stateMachine);
  expect(bound.grammar).toEqual({ round: payloadGrammar });
  [...bound.processInput(input(JSON.stringify(["round", { round: 3 }])))];
  expect(calls).toBe(3);
  expect(() =>
    stateMachine.bindGrammar([["round", payloadGrammar]])
  ).toThrow("grammar is already bound");
});

test("parse failures do not dispatch a transition", () => {
  const stateMachine = new StateMachine({ round: payloadGrammar });
  let calls = 0;
  stateMachine.addStateTransition("round", function* () {
    calls += 1;
  });
  const error = spyOn(console, "error").mockImplementation(() => {});

  try {
    [...stateMachine.processInput(input("not-json"))];
    expect(calls).toBe(0);
    expect(error).toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});

test("dispatch preserves generator yields and invokes its handler exactly once", () => {
  const stateMachine = new StateMachine({ round: payloadGrammar });
  const yielded = { type: "promise" as const, promise: Promise.resolve(7) };
  let calls = 0;
  stateMachine.addStateTransition("round", function* ({ parsedInput }) {
    calls += 1;
    expect(parsedInput.payload).toEqual({ round: 4 });
    yield yielded;
  });

  const transition = stateMachine.processInput(
    input(JSON.stringify(["round", { round: 4 }])),
  );
  expect(transition.next()).toEqual({ value: yielded, done: false });
  expect(transition.next()).toEqual({ value: undefined, done: true });
  expect(calls).toBe(1);
});

test("Stm is a transitional alias of the same StateMachine constructor", () => {
  const grammar = { round: payloadGrammar } as const;

  expect(Stm).toBe(StateMachine);
  expect(new Stm(grammar)).toBeInstanceOf(StateMachine);
});
