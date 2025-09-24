import type { MergeIntersects } from "@paima/utils";
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
> = {
  required: Required;
  /**
   * Note: each `optional` value MUST contain a `default` field.
   *       the default value can be null
   */
  optional: Optional;
};
export type AllProperties<
  Required extends ObjectLike,
  Optional extends ObjectLike,
  Bool extends boolean,
> = TIntersect<[Required, Bool extends true ? Optional : TPartial<Optional>]>;
export type AllPropertiesFor<
  Schema extends ConfigSchema<any, any>,
  Bool extends boolean,
> = Schema extends ConfigSchema<infer Required, infer Optional>
  ? AllProperties<Required, Optional, Bool>
  : never;

export type ToMapping<
  Type extends string,
  T extends Partial<Record<Type, ConfigSchema<TObject, TObject>>>,
> = {
  [K in keyof T]: T[K] extends ConfigSchema<TObject, TObject>
    ? MergeIntersects<Static<AllPropertiesFor<T[K], true>>>
    : never;
};

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
> {
  constructor(public readonly config: ConfigProperties<Required, Optional>) {
    // TODO: fast-fail if
    // 1. any required property is an optional field
    // 1. any `optional` does not set a default value

    // TODO: replace once TS5 decorators are better supported
    this.allProperties.bind(this);
    this.defaultProperties.bind(this);
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

  defaultProperties = (): MergeIntersects<Partial<Static<Optional>>> => {
    const defaults = Value.Default(this.config.optional, {});
    return defaults as any;
  };

  /**
   * Merge two ConfigSchemas together
   * DANGER: this will not merge top-level `options` of these objects
   */
  cloneMerge = <NewRequired extends ObjectLike, NewOptional extends ObjectLike>(
    newConfig:
      | ConfigProperties<NewRequired, NewOptional>
      | ConfigSchema<NewRequired, NewOptional>,
  ): ConfigSchema<
    TObject<ObjectContent<Required> & ObjectContent<NewRequired>>,
    TObject<ObjectContent<Optional> & ObjectContent<NewOptional>>
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
    }) as any;
  };
}

export function createSchema<
  Base extends ConfigSchema<ObjectLike, ObjectLike>,
  Required extends ObjectLike,
  Optional extends ObjectLike,
>(
  params: {
    base: Base;
    required: Required;
    optional: Optional;
  },
) {
  const config = params.base.cloneMerge({
    required: params.required,
    optional: params.optional,
  });
  const optionalProps = config.allProperties(false);
  const allProps = config.allProperties(true);

  return { optionalProps, allProps };
}
