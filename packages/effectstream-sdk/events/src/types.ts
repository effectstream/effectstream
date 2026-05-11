import { Type } from '@sinclair/typebox';
import type {
  TString,
  TInteger,
  TExtends,
  Kind,
  TTuple,
  TLiteral,
  TObject,
  Static,
  TSchema,
} from '@sinclair/typebox';
import { assertNever } from 'assert-never';

export enum EventBrokerNames {
  Engine = 'effectstream-engine',
  Batcher = 'batcher',
}

/**
 * Name inspired from https://docs.aws.amazon.com/whitepapers/latest/designing-mqtt-topics-aws-iot-core/mqtt-design-best-practices.html#:~:text=Since%20MQTT%20topics%20are%20case,when%20creating%20each%20topic%20level
 */
export enum TopicPrefix {
  Batcher = 'batcher',
  Node = 'node',
  App = 'app',
}

export function topicToBroker(topic: TopicPrefix): EventBrokerNames {
  switch (topic) {
    case TopicPrefix.Batcher:
      return EventBrokerNames.Batcher;
    case TopicPrefix.Node:
      return EventBrokerNames.Engine;
    case TopicPrefix.App:
      return EventBrokerNames.Engine;
    default:
      assertNever(topic);
  }
}

/**
 * ============================
 * Define paths for MQTT topics
 * ============================
 */

export type SimplePath = string;
export type ArgPath = { name: string; type: TSchema };
export type EventPath = (SimplePath | ArgPath)[];

/**
 * ===================================================
 * Define the dev-friendly event log definition format
 * ===================================================
 */

// MQTT parameters are just URLs, so they can only really be data types that are convertible to strings
type EnsureExtendsString<A extends TSchema> =
  TExtends<A, TString, TLiteral<true>, TLiteral<false>> extends TLiteral<true> ? A : never;
type EnsureExtendsNumber<A extends TSchema> =
  TExtends<A, TInteger, TLiteral<true>, TLiteral<false>> extends TLiteral<true> ? A : never;
type ValidMqttParameter<A extends TSchema> = EnsureExtendsString<A> | EnsureExtendsNumber<A>;

export type LogEventFields<Schema extends TSchema> = {
  indexed: boolean;
  /** keeps track if this indexed field is the string version of a complex data type (ex: if it's an object type) */
  hashed?: boolean;
  name: string;
  type: Schema;
};
export type LogEvent<Fields extends LogEventFields<any>[]> = {
  name: string;
  fields: Fields;
};

/**
 * ==============================================
 * Define the MQTT topic path + event type format
 * ==============================================
 */

export type EventPathAndDef = {
  path: EventPath;
  broker: EventBrokerNames;
  type: TObject;
};

/**
 * ============================================================
 * Transform paths into TS objects that can be partially filled
 * ============================================================
 */

// 1) Filter out all "simple" types, as they don't require any user input
type FilterSimple<T> = T extends SimplePath ? never : T;
type RemoveAllSimple<T extends EventPath> = T extends (infer U)[] ? FilterSimple<U>[] : never;
// 2) Turn the { name, type } pairs into { [name]: type } pairs aggregated as an object
//    Note: this is also resolving TSchema into TS types using Static<..>
type KeypairToObj<T extends { name: string; type: any }[]> = {
  [K in T[number] as K['name']]: Static<K['type']>;
};
// 3) Wrapper to apply transformations (1) and (2) together
export type ResolvedPath<Path extends EventPath> = KeypairToObj<RemoveAllSimple<Path>>;
// 4) Allow undefined types, as undefined -> + wildcard MQTT notation
export type Undefined<T extends Record<string, any>> = {
  [P in keyof T]: T[P] | undefined;
};
// 5) Wrapper to apply transformations (3) and (4) together
//    Note: Partial since unspecified types are also treated as undefined
export type UserFilledPath<Path extends EventPath> = Partial<Undefined<ResolvedPath<Path>>>;

/**
 * ======================================================================
 * Transform dev-friendly event type to typebox Schema for easy exporting
 * ======================================================================
 */

// Turn LogEventFields into typebox object types
type ToTObject<T extends Record<string, LogEventFields<any>>> = {
  -readonly [P in keyof T]: TObject<{
    indexed: TLiteral<T[P]['indexed']>;
    name: TLiteral<T[P]['name']>;
    type: T[P]['type'];
    hashed: TLiteral<DefaultToFalse<T[P]['hashed']>>;
  }>;
};

/**
 * Typebox doesn't provide the right interface for convert into a Tuple
 * So we provide our own wrapper here, then convert it to a proper Tuple later
 */
export type CustomTuple<T> = T extends TSchema[]
  ? TSchema & {
      [Kind]: 'Tuple';
      static: {
        [K in keyof T]: T[K] extends TSchema ? Static<T[K], TSchema['params']> : T[K];
      };
      type: 'array';
      items?: T;
      additionalItems?: false;
      minItems: number;
      maxItems: number;
    }
  : never;
// Convert our custom Tuple type into a typebox TTuple type
type AsTuple<T extends TSchema> = T extends TTuple<infer U> ? TTuple<U> : never;

export function toSchema<T extends LogEvent<any>>(
  event: T
): TObject<{
  name: TLiteral<T['name']>;
  fields: AsTuple<CustomTuple<ToTObject<T['fields']>>>;
}> {
  return Type.Object({
    name: Type.Literal(event.name),
    fields: Type.Tuple(
      event.fields.map((input: any) =>
        Type.Object({
          indexed: Type.Literal(input.indexed),
          name: Type.Literal(input.name),
          type: input.type,
          hashed: Type.Literal(input.hashed ?? false),
        })
      ) as T['fields'] // map(..) converts it to an array, but we need to consider it a tuple
    ),
  }) as any; // typescript can't really know this dynamic object matches our static type
}

/**
 * =======================================================
 * Transform dev-friendly event type to MQTT-friendly type
 * =======================================================
 */

// 1) Filter by entries that are "indexed" as they need to go in the path
type FilterIndexed<T> = T extends { indexed: true } ? T : never;
type RemoveAllUnindexed<T extends LogEventFields<TSchema>[]> = {
  [P in keyof T]: FilterIndexed<T[P]>;
};
// 2) Transform the types into ArgPath
type TransformEventInput<T> = T extends {
  readonly hashed?: infer Hashed;
  readonly name: infer N;
  readonly type: infer U;
}
  ? { hashed?: Hashed; name: N; type: U }
  : never;
export type TransformAllEventInput<T extends LogEventFields<TSchema>[]> = {
  [P in keyof T]: TransformEventInput<T[P]>;
};

// 3) Exclude tuple values. This is useful to remove `never` types created by object mapping
// ex: T extends { indexed: true } ? T : never;
export type ExcludeFromTuple<T extends readonly any[], E> = T extends [infer F, ...infer R]
  ? [F] extends [E]
    ? ExcludeFromTuple<R, E>
    : [F, ...ExcludeFromTuple<R, E>]
  : [];

type RemoveHashSuffix<T extends string> = T extends `${infer Prefix}Hash` ? Prefix : T;
// 4) add SimplePath with the same name in front of each ArgPath
type AddStringPath<T extends any[]> = T extends [
  { hashed?: infer Hashed; name: infer Name extends string; type: infer Type },
  ...infer Rest,
]
  ? [
      Hashed extends true ? RemoveHashSuffix<Name> : Name,
      { name: Name; type: Type },
      ...AddStringPath<Rest>,
    ]
  : [];

// 5) Filter by entries that are not "indexed" as they need to go in the output
type FilterNonIndexed<T> = T extends { indexed: false } ? T : never;
export type RemoveAllIndexed<T extends LogEventFields<TSchema>[]> = {
  [P in keyof T]: FilterNonIndexed<T[P]>;
};
// 6) Merge the type together into a single object
export type OutputKeypairToObj<T> = T extends { name: string; type: any }[]
  ? {
      [K in T[number] as K['name']]: K['type'];
    }
  : never; // not sure why this never is needed. Maybe ExcludeFromTuple isn't perfect

// 7) Map the prefix to the broker type
export type BrokerName<T extends TopicPrefix> = T extends TopicPrefix.Batcher
  ? EventBrokerNames.Batcher
  : EventBrokerNames.Engine;

type IndexedFields<T extends LogEventFields<TSchema>[]> = ExcludeFromTuple<
  TransformAllEventInput<RemoveAllUnindexed<T>>,
  never
>;

export function toPath<T extends LogEvent<LogEventFields<TSchema>[]>, Prefix extends TopicPrefix>(
  prefix: Prefix,
  event: T,
  signatureHash?: string
): {
  path: AddStringPath<IndexedFields<T['fields']>>;
  broker: BrokerName<Prefix>;
  type: TObject<
    OutputKeypairToObj<
      ExcludeFromTuple<TransformAllEventInput<RemoveAllIndexed<T['fields']>>, never>
    >
  >;
} {
  return {
    path: [
      prefix,
      ...[signatureHash].filter(x => x),
      ...event.fields
        .filter(input => input.indexed)
        .flatMap(input => [
          input.hashed === true
            ? input.name.substring(0, input.name.length - 'Hash'.length)
            : input.name,
          {
            name: input.name,
            type: input.type,
          },
        ]),
    ],
    broker: topicToBroker(prefix),
    type: Type.Object(
      event.fields
        .filter(input => !input.indexed)
        .reduce(
          (acc, curr) => {
            acc[curr.name] = curr.type;
            return acc;
          },
          {} as Record<string, TSchema>
        )
    ),
  } as any; // typescript can't really know this dynamic object matches our static type
}

/**
 * ================================================================
 * Wrap interface to make it more dev-friendly and less error-prone
 * ================================================================
 */

// 1) define a version where the `indexed` field is not required (defaults to false)
export type MaybeIndexedLogEventFields<Schema extends TSchema> = {
  indexed?: boolean;
  hashed?: boolean;
  name: string;
  type: Schema;
};
export type MaybeIndexedLogEvent<Fields extends MaybeIndexedLogEventFields<any>[]> = {
  name: string;
  fields: Fields;
};
type DefaultToFalse<T> = T extends true ? true : false;

// 2) Write a conversion from the optional indexed to the required indexed (with default filled)
type ToDefinitelyIndexedObject<T extends MaybeIndexedLogEventFields<any>[]> = {
  -readonly [P in keyof T]: {
    indexed: DefaultToFalse<T[P]['indexed']>;
    hashed: DefaultToFalse<T[P]['hashed']>;
    name: T[P]['name'];
    type: T[P]['type'];
  };
};
export type ToLog<T extends MaybeIndexedLogEvent<MaybeIndexedLogEventFields<TSchema>[]>> = {
  name: T['name'];
  fields: ToDefinitelyIndexedObject<T['fields']>;
};

// 3) Expose the public function. These two just type-check the user provided object for them instead of requiring the `satisfies` keyword
type Ensure<T extends MaybeIndexedLogEvent<MaybeIndexedLogEventFields<TSchema>[]>, U> =
  MaybeIndexedLogEvent<MaybeIndexedLogEventFields<TSchema>[]> extends U ? T : never;
export function genEvent<
  const T extends MaybeIndexedLogEvent<MaybeIndexedLogEventFields<TSchema>[]>,
>(event: DisallowComplexEventFields<T> & Ensure<T, MaybeIndexedLogEvent<any>>): ToLog<T> {
  for (const { name } of event.fields) {
    const invalidCharacters = ['$', '/', '+', '#'];
    for (const invalid of invalidCharacters) {
      if (name.includes(invalid)) {
        throw new Error(`Event ${event.name} has field ${name} with invalid character ${invalid}.`);
      }
    }
  }
  return event as any;
}

/**
 * ======================================================================
 * Replace indexed objects with hashes so they can be used as MQTT topics
 * ======================================================================
 */

type AddHashFields<T extends any[]> = T extends [
  { indexed: infer Indexed; name: infer Name extends string; type: infer Type extends TSchema },
  ...infer Rest,
]
  ? Indexed extends true
    ? ValidMqttParameter<Type> extends never
      ? [
          { hashed: true; indexed: true; name: `${Name}Hash`; type: TString },
          { indexed: false; name: Name; type: Type },
          ...AddHashFields<Rest>,
        ]
      : [{ indexed: Indexed; name: Name; type: Type }, ...AddHashFields<Rest>]
    : [{ indexed: Indexed; name: Name; type: Type }, ...AddHashFields<Rest>]
  : [];

export type EventAddHashFields<
  T extends { name: string; fields: MaybeIndexedLogEventFields<TSchema>[] },
> = {
  name: T['name'];
  fields: AddHashFields<T['fields']>;
};

export function addHashes<T extends LogEvent<LogEventFields<TSchema>[]>>(
  event: T
): EventAddHashFields<T> {
  return {
    name: event.name,
    fields: event.fields.flatMap(field => {
      if (field.indexed === false) return field;
      const isString = Type.Extends(
        field.type,
        Type.String(),
        Type.Literal(true),
        Type.Literal(false)
      ).const;
      const isNumber = Type.Extends(
        field.type,
        Type.Number(),
        Type.Literal(true),
        Type.Literal(false)
      ).const;
      if (isString || isNumber) {
        return field;
      }
      return [
        {
          indexed: true,
          type: Type.String(),
          name: `${field.name}Hash`,
          hashed: true,
        },
        {
          ...field,
          indexed: false,
        },
      ];
    }) as any,
  };
}

/**
 * ===================================================
 * Disable complex fields until we support these later
 * ===================================================
 */

// Disallows fields that aren't strings statically
type DisallowComplexFields<T extends MaybeIndexedLogEventFields<TSchema>[]> = {
  [P in keyof T]: T[P]['indexed'] extends false
    ? T[P]
    : ValidMqttParameter<T[P]['type']> extends never
      ? {
          indexed: T[P]['indexed'];
          name: T[P]['name'];
          type: never;
        }
      : T[P];
};

type DisallowComplexEventFields<T extends { fields: MaybeIndexedLogEventFields<TSchema>[] }> = {
  fields: DisallowComplexFields<T['fields']>;
};
