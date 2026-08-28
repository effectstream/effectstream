import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";
import { midnightGenericGrammar } from "../primitives/src/midnight-generic/midnight-genetic-grammar.ts";
import {
  type ParamToData,
  type RegisteredStateMachinePrefixes,
  StateMachine,
  Stm,
} from "../Stm.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type IsAny<Value> = 0 extends 1 & Value ? true : false;
type Assert<Condition extends true> = Condition;

const explicitGrammar = {
  precise: [["payload", Type.Object({ round: Type.Number() })]],
  label: [["value", Type.String()]],
} as const satisfies GrammarDefinition;

const explicit = new StateMachine<typeof explicitGrammar, {}>(explicitGrammar)
  .addStateTransition("precise", function* ({ parsedInput }) {
    const round: number = parsedInput.payload.round;
    void round;

    // @ts-expect-error Explicit grammar rejects fields absent from the payload.
    parsedInput.payload.notThere;
  })
  .addStateTransition("label", function* ({ parsedInput }) {
    const value: string = parsedInput.value;
    void value;
  });

type ExplicitPrefixes = Assert<
  Equal<
    RegisteredStateMachinePrefixes<typeof explicit>,
    "precise" | "label"
  >
>;
const explicitPrefixesCheck: ExplicitPrefixes = true;
void explicitPrefixesCheck;

const explicitInvalidPrefix = new StateMachine<typeof explicitGrammar, {}>(
  explicitGrammar,
);
// @ts-expect-error Explicit grammar rejects prefixes it does not declare.
explicitInvalidPrefix.addStateTransition("missing", function* () {});

const transitional = new Stm<typeof explicitGrammar, {}>(explicitGrammar);
transitional.addStateTransition("precise", function* ({ parsedInput }) {
  const round: number = parsedInput.payload.round;
  void round;
});

type MidnightPayloadIsAny = Assert<
  IsAny<ParamToData<typeof midnightGenericGrammar>["payload"]>
>;
const midnightPayloadCheck: MidnightPayloadIsAny = true;
void midnightPayloadCheck;

const unbound = new StateMachine()
  .addStateTransition("midnight", function* ({ parsedInput }) {
    type UnboundPayloadIsAny = Assert<IsAny<typeof parsedInput.payload>>;
    const unboundPayloadCheck: UnboundPayloadIsAny = true;
    const round = parsedInput.payload.round;
    void unboundPayloadCheck;
    void round;
  })
  .addStateTransition("another", function* () {});

type UnboundPrefixes = Assert<
  Equal<
    RegisteredStateMachinePrefixes<typeof unbound>,
    "midnight" | "another"
  >
>;
const unboundPrefixesCheck: UnboundPrefixes = true;
void unboundPrefixesCheck;

declare function naiveSiblingContext<Config>(options: {
  config: Config;
  transition: (data: unknown) => void;
}): void;

naiveSiblingContext({
  config: { grammar: explicitGrammar },
  transition: (data) => {
    // @ts-expect-error A sibling config does not contextually type this value.
    data.parsedInput.payload.round;
  },
});
