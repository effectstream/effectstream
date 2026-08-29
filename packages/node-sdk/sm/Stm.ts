import {
  type CommandTuples,
  type FullJsonGrammar,
  type GrammarDefinition,
  parseStmInput,
  toFullJsonGrammar,
  toKeyedJsonGrammar,
} from "@effectstream/concise";
import type { AppEvents } from "./types.ts";
import type { Static, TSchema } from "@sinclair/typebox";
import type { BaseStfInput, BaseStfOutput } from "./types.ts";
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

export class StateMachine<
  const Grammar extends GrammarDefinition,
  Events extends AppEvents = AppEvents,
  RegisteredPrefixes extends keyof Grammar & string = never,
> {
  public readonly keyedJsonGrammar: CommandTuples<Grammar>;
  public readonly fullJsonGrammar: FullJsonGrammar<Grammar>;

  constructor(public readonly grammar: Grammar) {
    // TODO: replace once TS5 decorators are better supported
    this.addStateTransition.bind(this);
    this.processInput.bind(this);

    this.keyedJsonGrammar = toKeyedJsonGrammar(grammar);
    this.fullJsonGrammar = toFullJsonGrammar(this.keyedJsonGrammar);
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
    return this;
  }

  *processInput(input: BaseStfInput): SyncStateUpdateStream<void> {
    let prefix, data;
    try {
      const parsedInput = parseStmInput(
        input.conciseInput,
        this.grammar,
        this.keyedJsonGrammar,
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
}

export { StateMachine as Stm };
