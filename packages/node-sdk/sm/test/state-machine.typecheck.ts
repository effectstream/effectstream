import { Type } from "@sinclair/typebox";
import { StateMachine, Stm } from "../Stm.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Value extends true> = Value;
type RegisteredPrefixes<Value> =
  Value extends StateMachine<any, any, infer Prefix> ? Prefix : never;

const grammar = {
  join: [
    ["user", Type.String()],
    ["age", Type.Number()],
  ] as const,
  leave: [["reason", Type.String()]] as const,
} as const;

const machine = new StateMachine(grammar);
const afterJoin = machine.addStateTransition("join", function* ({
  parsedInput,
}) {
  const user: string = parsedInput.user;
  const age: number = parsedInput.age;
  void user;
  void age;

  // @ts-expect-error The join payload has no leave reason.
  parsedInput.reason;
});
const afterLeave = afterJoin.addStateTransition("leave", function* ({
  parsedInput,
}) {
  const reason: string = parsedInput.reason;
  void reason;

  // @ts-expect-error The leave payload has no join user.
  parsedInput.user;
});

type _RegisteredPrefixes = Expect<
  Equal<RegisteredPrefixes<typeof afterLeave>, "join" | "leave">
>;

// @ts-expect-error Prefixes must come from the constructor grammar.
machine.addStateTransition("missing", function* () {});

// @ts-expect-error The constructor grammar is mandatory.
new StateMachine();

new StateMachine({
  inline: [["enabled", Type.Boolean()]],
}).addStateTransition("inline", function* ({ parsedInput }) {
  const enabled: boolean = parsedInput.enabled;
  void enabled;

  // @ts-expect-error Inline constructor inference retains exact fields.
  parsedInput.missing;
});

type Events = { readonly example: "event" };
const legacy = new Stm<typeof grammar, Events>(grammar);
legacy.addStateTransition("join", function* ({ parsedInput }) {
  const user: string = parsedInput.user;
  void user;
});

const aliasConstructor: typeof StateMachine = Stm;
void aliasConstructor;
