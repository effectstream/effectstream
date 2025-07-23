import {
  type CommandTuples,
  type FullJsonGrammar,
  type GrammarDefinition,
  parseStmInput,
  toFullJsonGrammar,
  toKeyedJsonGrammar,
} from "@paima/concise";
import type { AppEvents } from "./types.ts";
import type { Static, TSchema } from "@sinclair/typebox";
import type { BaseStfInput, BaseStfOutput } from "./types.ts";
import type { SyncStateUpdateStream } from "@paima/coroutine";

export type ParamToData<T extends readonly Readonly<[string, TSchema]>[]> = {
  [K in T[number] as K[0]]: Static<K[1]>;
};
export type MessageListener<
  Events extends AppEvents,
  Params extends readonly Readonly<[string, TSchema]>[],
> = (
  input: BaseStfInput & { parsedInput: ParamToData<Params> },
) => SyncStateUpdateStream<void>;

export class PaimaSTM<
  Grammar extends GrammarDefinition,
  Events extends AppEvents,
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
  ): void {
    if (this.messageListeners.has(prefix)) {
      throw new Error(
        `Disallowed: duplicate listener for prefix ${prefix}. Duplicate prefixes can cause determinism issues`,
      );
    }
    this.messageListeners.set(prefix, call);
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
      console.error(
        `Skipping input with invalid format: `,
        input.conciseInput,
      );
      if (_e instanceof Error) {
        console.error(_e.message);
      }
      return;
    }
    const listener = this.messageListeners.get(prefix);
    if (listener == null) {
      console.error(
        `Prefix found with no corresponding state transition: ${prefix}`,
      );
      return;
    }

    yield* listener({ ...input, parsedInput: data });
    return;
  }
}
