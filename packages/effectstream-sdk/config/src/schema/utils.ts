import type { MergeIntersects } from "@effectstream/utils";
import type { Static, TIntersect, TObject, TPartial } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * We limit the top-level types that are allowed to avoid performance issues.
 * The problem comes with `cloneMerge` where we need to combine many ConfigSchemas together.
 * If we allow things other than objects, we have to support almost *any* type
 *
 * You might be tempted to think you could just handle only common cases:
 * - TObject, TUnion, TIntersect
 * But the problem is combining these is non-trivial in a general way.
 * There exists a general solution `TComposite<TObject[]>`,
 * but the type is extremely complex which slows down Typescript a lot.
 */
type ObjectLike = TObject;

type ObjectContent<T extends ObjectLike> = T extends TObject<infer O> ? O
  : never;

export type ConfigProperties<
  Required extends ObjectLike,
  Optional extends ObjectLike,
  Defaults extends object = {},
> = {
  required: Required;
  /**
   * Note: each `optional` value MUST contain a `default` field.
   *       the default value can be null
   */
  optional: Optional;
  /**
   * Typed defaults may be literal values or zero-argument lazy providers.
   * Providers are resolved only when their field is absent at materialization.
   */
  defaults?: Defaults & ConfigDefaults<Optional>;
};
export type AllProperties<
  Required extends ObjectLike,
  Optional extends ObjectLike,
  Bool extends boolean,
> = TIntersect<[Required, Bool extends true ? Optional : TPartial<Optional>]>;
export type AllPropertiesFor<
  Schema extends ConfigSchema<any, any, any>,
  Bool extends boolean,
> = Schema extends ConfigSchema<infer Required, infer Optional, any>
  ? AllProperties<Required, Optional, Bool>
  : never;

export type DefaultProvider<Value> = Value | (() => Value);
export type ConfigDefaults<Optional extends ObjectLike> = Partial<{
  [K in keyof Static<Optional>]: DefaultProvider<Static<Optional>[K]>;
}>;
export type ResolvedDefaults<Defaults> = {
  [K in keyof Defaults]: Defaults[K] extends (...args: never[]) => infer Result
    ? Result
    : Defaults[K];
};
type Simplify<T> = { [K in keyof T]: T[K] };
type StrictNullChecksEnabled = undefined extends string ? false : true;
type RequiredKeys<Input> = {
  [K in keyof Input]-?: {} extends Pick<Input, K> ? never : K;
}[keyof Input];
type DefinitelyDefinedKeys<
  Input,
  DefaultableKeys extends PropertyKey,
> = StrictNullChecksEnabled extends true ? {
    [K in RequiredKeys<Input>]: undefined extends Input[K] ? never : K;
  }[RequiredKeys<Input>]
  // Without strict null analysis, TypeScript cannot distinguish `T` from
  // `T | undefined`. Keep every schema-optional field branch-aware rather
  // than falsely claiming that a runtime default cannot be selected.
  : Exclude<RequiredKeys<Input>, DefaultableKeys>;
type DefinitelyDefinedInput<
  Input,
  DefaultableKeys extends PropertyKey,
> = Pick<Input, DefinitelyDefinedKeys<Input, DefaultableKeys>>;
type MaybeDefinedKeys<
  Input,
  DefaultableKeys extends PropertyKey,
> = Exclude<keyof Input, DefinitelyDefinedKeys<Input, DefaultableKeys>>;
type OverlayMaybeDefined<
  Base,
  Input,
  DefaultableKeys extends PropertyKey,
> = {
  [K in keyof Base]: K extends MaybeDefinedKeys<Input, DefaultableKeys>
    ? K extends keyof Input ? Base[K] | Exclude<Input[K], undefined>
    : Base[K]
    : Base[K];
};
type MaybeDefinedExtras<
  Base,
  Input,
  DefaultableKeys extends PropertyKey,
> = {
  [K in Exclude<MaybeDefinedKeys<Input, DefaultableKeys>, keyof Base>]?:
    Exclude<Input[K], undefined>;
};

export type MaterializedPropertiesFor<
  Schema extends ConfigSchema<any, any, any>,
> = Schema extends ConfigSchema<infer Required, infer Optional, infer Defaults>
  ? Simplify<
    & Omit<
      Static<AllProperties<Required, Optional, true>>,
      keyof ResolvedDefaults<Defaults>
    >
    & ResolvedDefaults<Defaults>
  >
  : never;

export type MaterializedWithInput<
  Schema extends ConfigSchema<any, any, any>,
  Input,
> = Simplify<
  & Omit<
    OverlayMaybeDefined<
      MaterializedPropertiesFor<Schema>,
      Input,
      keyof MaterializedPropertiesFor<Schema>
    >,
    keyof DefinitelyDefinedInput<
      Input,
      keyof MaterializedPropertiesFor<Schema>
    >
  >
  & DefinitelyDefinedInput<
    Input,
    keyof MaterializedPropertiesFor<Schema>
  >
  & MaybeDefinedExtras<
    MaterializedPropertiesFor<Schema>,
    Input,
    keyof MaterializedPropertiesFor<Schema>
  >
>;

export type ToMapping<
  Type extends string,
  T extends Partial<Record<Type, ConfigSchema<TObject, TObject, any>>>,
> = {
  [K in keyof T]: T[K] extends ConfigSchema<TObject, TObject, any>
    ? MergeIntersects<Static<AllPropertiesFor<T[K], true>>>
    : never;
};

export type MaterializedFromRegistry<
  Registry extends {
    readonly [Key in keyof Registry]: ConfigSchema<TObject, TObject, any>;
  },
  Input,
> = Input extends { type: infer Type }
  ? Type extends keyof Registry
    ? Registry[Type] extends ConfigSchema<TObject, TObject, any>
      ? MaterializedWithInput<Registry[Type], Input>
    : never
  : never
  : never;

/**
 * This class is to used to help handle the fact that some fields are required and some are optional.
 *
 * Notably, in some cases we want to allow omitting optional fields (when defining your configuration)
 * But in other cases (ex: using the config after it's been generated), we want to enforce that all optional fields that have a default are present.
 *
 * You can't easily solve this in Typebox without this class
 * because default values aren't part of the type signature
 * so there is no easy way to recover them after-the-fact
 * (aka distinguish between a field that defaults to null vs defaults to a non-nullable specific value)
 * However, it's possible thanks to this class
 */
export class ConfigSchema<
  Required extends ObjectLike,
  Optional extends ObjectLike,
  const Defaults extends object = {},
> {
  constructor(
    public readonly config: ConfigProperties<Required, Optional, Defaults>,
  ) {
    // TODO: fast-fail if
    // 1. any required property is an optional field
    // 1. any `optional` does not set a default value

    // TODO: replace once TS5 decorators are better supported
    this.allProperties.bind(this);
    this.defaultProperties.bind(this);
    this.materialize.bind(this);
    this.cloneMerge.bind(this);
  }

  allProperties = <Bool extends boolean>(
    requireOptional: Bool,
  ): AllProperties<Required, Optional, Bool> => {
    return Type.Intersect([
      this.config.required,
      requireOptional
        ? this.config.optional
        : Type.Partial(this.config.optional),
    ]) as any;
  };

  defaultProperties = (): MergeIntersects<
    Partial<Static<Optional>> & ResolvedDefaults<Defaults>
  > => {
    const defaults = Value.Default(
      this.config.optional,
      {},
    ) as Record<PropertyKey, unknown>;
    for (const [key, provider] of Object.entries(this.config.defaults ?? {})) {
      defaults[key] = typeof provider === "function" ? provider() : provider;
    }
    return defaults as any;
  };

  materialize = <const Input extends Record<PropertyKey, unknown>>(
    input: Input,
  ): MaterializedWithInput<ConfigSchema<Required, Optional, Defaults>, Input> => {
    const result = Value.Default(
      this.config.optional,
      {},
    ) as Record<PropertyKey, unknown>;

    for (const [key, provider] of Object.entries(this.config.defaults ?? {})) {
      if (input[key] === undefined) {
        result[key] = typeof provider === "function" ? provider() : provider;
      }
    }
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) result[key] = value;
    }

    return result as any;
  };

  /**
   * Merge two ConfigSchemas together
   * DANGER: this will not merge top-level `options` of these objects
   */
  cloneMerge = <
    NewRequired extends ObjectLike,
    NewOptional extends ObjectLike,
    const NewDefaults extends object = {},
  >(
    newConfig:
      | ConfigProperties<NewRequired, NewOptional, NewDefaults>
      | ConfigSchema<NewRequired, NewOptional, NewDefaults>,
  ): ConfigSchema<
    TObject<ObjectContent<Required> & ObjectContent<NewRequired>>,
    TObject<ObjectContent<Optional> & ObjectContent<NewOptional>>,
    Omit<Defaults, keyof NewDefaults> & NewDefaults
  > => {
    const config = newConfig instanceof ConfigSchema
      ? newConfig.config
      : newConfig;

    return new ConfigSchema({
      required: Type.Object({
        ...this.config.required.properties,
        ...config.required.properties,
      }),
      optional: Type.Object({
        ...this.config.optional.properties,
        ...config.optional.properties,
      }),
      defaults: {
        ...(this.config.defaults ?? {}),
        ...(config.defaults ?? {}),
      },
    }) as any;
  };
}

export function materializeDiscriminated<
  const Registry extends {
    readonly [Key in keyof Registry]: ConfigSchema<TObject, TObject, any>;
  },
  const Input extends { type: keyof Registry },
>(
  registry: Registry,
  input: Input,
): MaterializedFromRegistry<Registry, Input> {
  const schema = registry[input.type];
  if (schema === undefined) {
    throw new Error(`Unknown configuration type ${String(input.type)}`);
  }
  return schema.materialize(input) as unknown as MaterializedFromRegistry<
    Registry,
    Input
  >;
}
