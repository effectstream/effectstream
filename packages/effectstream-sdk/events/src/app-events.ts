import type {
  ArgPath,
  BrokerName,
  EventAddHashFields,
  ExcludeFromTuple,
  LogEvent,
  LogEventFields,
  MaybeIndexedLogEventFields,
  OutputKeypairToObj,
  RemoveAllIndexed,
  TransformAllEventInput,
} from './types.ts';
import { addHashes, toPath, TopicPrefix } from './types.ts';
import type { TSchema, Static, TObject } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import sha3 from 'js-sha3';
const { keccak_256 } = sha3;

/**
 * Indexed field auto-prepended to every event registered via `registerEvents`.
 * The runtime closure fills `blockHeight` from `BaseStfInput.blockHeight`, so
 * app code never sets it manually. Lets subscribers filter by block range
 * (or wildcard with `blockHeight: undefined`) for free.
 */
const BLOCK_HEIGHT_FIELD = {
  name: 'blockHeight',
  type: Type.Integer(),
  indexed: true,
} as const satisfies MaybeIndexedLogEventFields<TSchema>;

type Data<T extends LogEvent<LogEventFields<TSchema>[]>> = {
  name: T['name'];
  fields: KeypairToObj<T['fields']>;
  topic: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AllEventsUnion<T extends Record<string, LogEvent<LogEventFields<TSchema>[]>>> = {
  [K in keyof T]: Data<T[K]>;
};

export type EventQueue<T extends Record<string, LogEvent<LogEventFields<TSchema>[]>>> = {
  address: `0x${string}`;
  data: AllEventsUnion<T>[keyof T];
}[];

export const toSignature = <T extends LogEvent<LogEventFields<TSchema>[]>>(event: T): string => {
  return event.name + '(' + event.fields.map(f => f.type.type).join(',') + ')';
};

export const toSignatureHash = <T extends LogEvent<LogEventFields<TSchema>[]>>(
  event: T
): string => {
  return keccak_256(toSignature(event));
};

export type AppEvents = ReturnType<typeof groupEvents>;

export type RegisteredEvent<T extends LogEvent<LogEventFields<TSchema>[]>> = {
  /**
   * the next three properties are basically the return type of toPath, but
   * using ReturnType for some reason binds path to never[], which makes any
   * assignment fail to typecheck.
   */
  path: (string | ArgPath)[];
  broker: BrokerName<TopicPrefix.App>;
  type: TObject<
    OutputKeypairToObj<
      ExcludeFromTuple<TransformAllEventInput<RemoveAllIndexed<T['fields']>>, never>
    >
  >;
  /**
   * keep the original definition around since it's nicer to work with, it
   * also has the advantage that it allows recovering the initial order in
   * case the signature/topicHash needs to be computed again, which can't be
   * done from the path (since you don't know which non indexed fields go in
   * between each indexed field).
   */
  definition: T;
  /**
   * we add this to avoid having to re-compute it all the time
   */
  topicHash: string;
};

/**
 * Prepend the auto `blockHeight` indexed field.
 *
 * NOTE: we intentionally do NOT call `addHashes` here. `addHashes` only
 * short-circuits fields where `field.indexed === false`, but user-defined
 * fields default to `indexed: undefined` (the `genEvent` helper doesn't
 * normalize it). For non-string/non-integer types (Array, Boolean, etc.)
 * with `indexed: undefined`, `addHashes` injects a phantom `${name}Hash`
 * indexed field — which ends up in the path slot but never gets a value
 * in publish payloads. `fillPath` then emits a trailing `/#` (multi-level
 * wildcard) to close the path, producing a topic like
 * `app/<hash>/blockHeight/N/buyer/X/launchpad/Y/#`. MQTT PUBLISH topics
 * cannot contain `#` — the encoder rejects them and the publish silently
 * fails. The original `registerEvents` (pre-this-PR) did not call
 * `addHashes`; apps that need complex-type indexing can call it explicitly.
 */
function prepareEventForRegistration<T extends LogEvent<LogEventFields<TSchema>[]>>(
  event: T
): LogEvent<LogEventFields<TSchema>[]> {
  return {
    name: event.name,
    fields: [BLOCK_HEIGHT_FIELD, ...event.fields],
  } as LogEvent<LogEventFields<TSchema>[]>;
}

/**
 * The precise type of the post-prepare event combines `EventAddHashFields`
 * (for indexed complex types) and the `blockHeight` field prepend. TypeScript
 * can't statically verify that this nested tuple transform satisfies
 * `LogEvent<LogEventFields<TSchema>[]>` — the tuple→array widening is unsound
 * for varying optional `hashed` flags. We surface a wider `RegisteredEvent`
 * type here; consumers reach into `.definition` for the typed field shape.
 *
 * The runtime shape IS compatible (toPath accepts it and produces the right
 * topic path), and apps subscribing don't need the precise field tuple — they
 * just need `path`, `broker`, `type`, `topicHash`, all of which are correct.
 *
 * Future work: a properly-typed `RegisteredAppEvent<T>` helper that exposes
 * the full transformed field type so `filter` and event-callback args get
 * IDE-precise inference for indexed/non-indexed splits.
 */
export const registerEvents = <const T extends Record<string, LogEvent<LogEventFields<TSchema>[]>>>(
  entries: T
): {
  [K in keyof T]: RegisteredEvent<LogEvent<LogEventFields<TSchema>[]>>;
} => {
  return Object.fromEntries(
    Object.keys(entries).map(key => {
      const prepared = prepareEventForRegistration(entries[key]);
      // topicHash is computed from the ORIGINAL definition (without blockHeight or
      // hash transforms) — it's the developer-visible event signature, and we
      // don't want adding blockHeight to silently break consumers that compute
      // hashes from the source event.
      const topicHash = toSignatureHash(entries[key]);
      return [
        key,
        {
          ...toPath(TopicPrefix.App, prepared, topicHash),
          definition: prepared,
          topicHash,
        },
      ];
    })
  ) as any; // we can't know the type here
};

/**
 * groups events by their name (essentially, grouping by overloads)
 */
export const groupEvents = <
  T extends Record<string, RegisteredEvent<LogEvent<LogEventFields<TSchema>[]>>>,
>(
  events: T
): {
  [K in T[string] as K['definition']['name']]: T[string][];
} => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: Record<string, any> = {}; // we can't know the type here
  for (const key of Object.keys(events)) {
    const event = events[key];
    if (!result[event.definition.name]) {
      result[event.definition.name] = [];
    }

    result[event.definition.name].push(event);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result as any;
};

// Create payload for the stf from an object.  Using this allows statically
// checking `data` with the type from `T`.
export const encodeEventForStf = <
  T extends Omit<RegisteredEvent<LogEvent<LogEventFields<TSchema>[]>>, 'path'>,
>(args: {
  from: `0x${string}`;
  topic: T;
  data: KeypairToObj<T['definition']['fields']>;
}): {
  address: `0x${string}`;
  data: {
    name: T['definition']['name'];
    fields: KeypairToObj<T['definition']['fields']>;
    topic: string;
  };
} => {
  return {
    address: args.from,
    data: {
      name: args.topic.definition.name,
      fields: args.data,
      topic: toSignatureHash(args.topic.definition),
    },
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KeypairToObj<T extends { name: string; type: any }[]> = {
  [K in T[number] as K['name']]: Static<K['type']>;
};
