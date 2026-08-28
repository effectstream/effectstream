import {
  type CommandTuples,
  type FullJsonGrammar,
  type GrammarDefinition,
  parseStmInput,
  toFullJsonGrammar,
  toKeyedJsonGrammar,
} from "@effectstream/concise";
import type { AppEvents } from "./types.ts";
import type { Static, TAny, TSchema } from "@sinclair/typebox";
import type { BaseStfInput } from "./types.ts";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";

export type ParamToData<T extends readonly Readonly<[string, TSchema]>[]> = {
  [K in T[number] as K[0]]: Static<K[1]>;
};
export type MessageListener<
  Events extends AppEvents,
  Params extends readonly Readonly<[string, TSchema]>[],
> = (
  input: BaseStfInput & { parsedInput: ParamToData<Params> },
) => SyncStateUpdateStream<void>;

/**
 * The compile-time shape used until runtime binds the primitive grammars.
 * Midnight Generic's payload is currently `Type.Any()`, so its unbound
 * callback retains that existing precision without claiming sibling-property
 * inference from a runner config object.
 */
export type UnboundStateMachineGrammar = Record<
  string,
  readonly Readonly<[string, TAny]>[]
>;

export type StateMachineGrammarEntry = GrammarDefinition[string];
export type StateMachineGrammarBinding = readonly [
  prefix: string,
  grammar: StateMachineGrammarEntry,
];
export type StateMachineGrammarBindings = readonly StateMachineGrammarBinding[];

export type GrammarFromBindings<Bindings extends StateMachineGrammarBindings> = {
  [Binding in Bindings[number] as Binding[0]]: Binding[1];
};

export type RegisteredStateMachinePrefixes<StateMachineType> =
  StateMachineType extends StateMachine<any, any, infer Prefixes>
    ? Prefixes
    : never;

/**
 * A typed state-machine dispatcher. Construct it with a grammar for the
 * explicit legacy-compatible path, or without arguments when the canonical
 * runtime will bind primitive grammars before synchronization starts.
 */
export class StateMachine<
  Grammar extends GrammarDefinition = UnboundStateMachineGrammar,
  Events extends AppEvents = AppEvents,
  RegisteredPrefixes extends string = never,
> {
  private boundGrammar: GrammarDefinition | undefined;
  private boundKeyedJsonGrammar: CommandTuples<GrammarDefinition> | undefined;
  private boundFullJsonGrammar: FullJsonGrammar<GrammarDefinition> | undefined;

  constructor(grammar?: Grammar) {
    if (grammar !== undefined) {
      this.setGrammar(grammar);
    }
  }

  /** The grammar currently owned by this instance. Runtime binds it once. */
  get grammar(): Grammar {
    return this.boundGrammar as Grammar;
  }

  get keyedJsonGrammar(): CommandTuples<Grammar> {
    return this.boundKeyedJsonGrammar as CommandTuples<Grammar>;
  }

  get fullJsonGrammar(): FullJsonGrammar<Grammar> {
    return this.boundFullJsonGrammar as unknown as FullJsonGrammar<Grammar>;
  }

  get registeredPrefixes(): readonly RegisteredPrefixes[] {
    return [...this.messageListeners.keys()] as RegisteredPrefixes[];
  }

  messageListeners = new Map<
    string,
    MessageListener<Events, readonly Readonly<[string, TSchema]>[]>
  >();

  addStateTransition<const Prefix extends keyof Grammar & string>(
    prefix: Prefix,
    call: MessageListener<Events, Grammar[Prefix]>,
  ): StateMachine<Grammar, Events, RegisteredPrefixes | Prefix> {
    if (this.messageListeners.has(prefix)) {
      throw new Error(
        `Disallowed: duplicate listener for prefix ${prefix}. Duplicate prefixes can cause determinism issues`,
      );
    }
    this.messageListeners.set(prefix, call);
    return this as StateMachine<
      Grammar,
      Events,
      RegisteredPrefixes | Prefix
    >;
  }

  bindGrammar<const Bindings extends StateMachineGrammarBindings>(
    bindings: Bindings,
  ): StateMachine<GrammarFromBindings<Bindings>, Events, RegisteredPrefixes>;
  bindGrammar<const BoundGrammar extends GrammarDefinition>(
    grammar: BoundGrammar,
  ): StateMachine<BoundGrammar, Events, RegisteredPrefixes>;
  bindGrammar(
    grammarOrBindings: GrammarDefinition | StateMachineGrammarBindings,
  ): StateMachine<GrammarDefinition, Events, RegisteredPrefixes> {
    if (this.boundGrammar !== undefined) {
      throw new Error("StateMachine grammar is already bound");
    }

    const entries: StateMachineGrammarBindings = Array.isArray(
      grammarOrBindings,
    )
      ? grammarOrBindings
      : Object.entries(grammarOrBindings);
    const configuredPrefixes = new Set<string>();
    const grammar: GrammarDefinition = {};

    for (const [prefix, entry] of entries) {
      if (configuredPrefixes.has(prefix)) {
        throw new Error(
          `Disallowed: duplicate configured grammar prefix ${prefix}. Duplicate prefixes can cause determinism issues`,
        );
      }
      configuredPrefixes.add(prefix);
      grammar[prefix] = entry;
    }

    const unknownPrefixes = [...this.messageListeners.keys()].filter(
      (prefix) => !configuredPrefixes.has(prefix),
    );
    const missingPrefixes = [...configuredPrefixes].filter(
      (prefix) => !this.messageListeners.has(prefix),
    );

    if (unknownPrefixes.length > 0 || missingPrefixes.length > 0) {
      const problems = [];
      if (unknownPrefixes.length > 0) {
        problems.push(
          `unknown registered prefix${unknownPrefixes.length === 1 ? "" : "es"}: ${unknownPrefixes.join(", ")}`,
        );
      }
      if (missingPrefixes.length > 0) {
        problems.push(
          `missing transition handler${missingPrefixes.length === 1 ? "" : "s"}: ${missingPrefixes.join(", ")}`,
        );
      }
      throw new Error(
        `StateMachine grammar binding failed: ${problems.join("; ")}`,
      );
    }

    this.setGrammar(grammar);
    return this as unknown as StateMachine<
      GrammarDefinition,
      Events,
      RegisteredPrefixes
    >;
  }

  *processInput(input: BaseStfInput): SyncStateUpdateStream<void> {
    if (
      this.boundGrammar === undefined ||
      this.boundKeyedJsonGrammar === undefined
    ) {
      throw new Error(
        "StateMachine grammar must be bound before processing inputs",
      );
    }

    let prefix, data;
    try {
      const parsedInput = parseStmInput(
        input.conciseInput,
        this.boundGrammar,
        this.boundKeyedJsonGrammar,
      );
      prefix = parsedInput.prefix;
      data = parsedInput.data;
    } catch (_e) {
      if (_e instanceof Error) {
        console.error(`[STM] Parsing error:`, _e.message);
      }
      console.error(
        `[STM] Cannot parse the input with the known grammar:`,
        input.conciseInput,
      );
      return;
    }
    const listener = this.messageListeners.get(prefix);
    if (listener == null) {
      console.error(
        `Grammar match, but no prefix found with corresponding state transition: ${prefix}`,
      );
      return;
    }

    yield* listener({ ...input, parsedInput: data });
    return;
  }

  private setGrammar(grammar: GrammarDefinition): void {
    const keyedJsonGrammar = toKeyedJsonGrammar(grammar);
    this.boundGrammar = grammar;
    this.boundKeyedJsonGrammar = keyedJsonGrammar;
    this.boundFullJsonGrammar = toFullJsonGrammar(keyedJsonGrammar);
  }
}

/** Transitional name for the exact same constructor and implementation. */
export { StateMachine as Stm };
