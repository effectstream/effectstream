import type { TObject } from "@sinclair/typebox";
import type { EvmAddress } from "./nominal.ts";

export type IntersectObject<T, Obj> = T extends TObject<infer O>
  ? TObject<ShallowMergeIntersects<O & Obj>>
  : never;

// TODO: this probably doesn't belong in this file
export type TransactionTemplate = {
  data: string;
  to: EvmAddress;
  gasPrice: string;
};

/**
 * @description Combines members of an intersection into a readable type.
 *
 * @see {@link https://twitter.com/Riyaadh_Abr/status/1622736576303312899/photo/1}
 * @example
 * MergeIntersects<{ a: string } & { b: string } & { c: number, d: bigint }>
 * => { a: string, b: string, c: number, d: bigint }
 */
export type MergeIntersects<T> = T extends
  | Record<string, unknown>
  | readonly Record<string, unknown>[]
  ? T extends infer Obj ? { [K in keyof Obj]: MergeIntersects<Obj[K]> }
  : never
  : T;

/**
 * Same as the above, but shallow (not recursive)
 * This is useful if you don't want Typescript to expand an underlying type
 *
 * ex: avoid { foo: FooType } turning into { foo: { a: string, b: string } }
 */
export type ShallowMergeIntersects<T> =
  & {
    [K in keyof T]: T[K];
  }
  & {};

/**
 * Flips an object so key are values and values are keys
 *
 * ex: Record<A, B> becomes Partial<Record<B, A>>
 */
export type FlipObject<T extends Record<any, any>> = {
  [Value in T[keyof T]]: keyof {
    [Key in keyof T as Value extends T[Key] ? Key : never]: any;
  };
};

export type NoUndefinedField<T> = { [P in keyof T]-?: NonNullable<T[P]> };

export type ElementOf<T extends readonly any[]> = T extends (infer Elem)[]
  ? Elem
  : never;
export type ValueOf<T> = T[keyof T];

export type Satisfies<Base, T> = T extends Base ? true : false;

export type RemoveNeverEntries<T extends Record<any, any>> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};
export type IdxOf<T> = { [idx in keyof T]: idx }[any];

export type RemoveUnknown<T> = unknown extends T
  ? (T extends unknown ? never : T)
  : T;

type ImmutablePrimitive =
  | undefined
  | null
  | boolean
  | string
  | number
  | Function;
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };
export type DeepMutable<T> = T extends ImmutablePrimitive ? T
  : T extends ReadonlyArray<infer U> ? Array<DeepMutable<U>>
  : T extends ReadonlySet<infer U> ? Set<DeepMutable<U>>
  : T extends ReadonlyMap<infer K, infer V>
    ? Map<DeepMutable<K>, DeepMutable<V>>
  : T extends Function ? T
  : T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
  : T;
export type DeepReadonly<T> = T extends ImmutablePrimitive ? T
  : T extends Array<infer U> ? ReadonlyArray<DeepReadonly<U>>
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends Set<infer M> ? ReadonlySet<DeepReadonly<M>>
  : {
    readonly [K in keyof T]: DeepReadonly<T[K]>;
  };

export type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends (
    k: infer I extends U,
  ) => void ? I
    : never;

const __TypeError = Symbol("OpaqueTypeError");
type TypeError<BaseType extends string> = BaseType & {
  readonly [__TypeError]: BaseType;
};
/**
 * Prints custom error message
 * Taken from https://github.com/wevm/abitype/blob/main/packages/abitype/src/types.ts#L11
 *
 * @param messages - Error message
 * @returns Custom error message
 *
 * @example
 * type Result = Error<'Custom error message'>
 * //   ^? type Result = ['Error: Custom error message']
 */
export type TypeErrorMessage<messages extends string | string[]> =
  messages extends string ? TypeError<messages>
    : {
      [key in keyof messages]: messages[key] extends
        infer message extends string ? TypeError<message>
        : never;
    };

/**
 * Types that Typescript allows inside a string template
 */
export type Stringifiable =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined;

/**
 * Turns an Object whose keys are numbers into an equivalent tuple
 * WARNING: This ONLY works if the keys are consecutive numbers starting from 0
 */
export type ToTupleSimple<
  T extends { [key: number]: any },
  Acc extends any[] = [],
> = Acc["length"] extends keyof T ? ToTupleSimple<T, [...Acc, T[Acc["length"]]]>
  : Acc;

// Helper type to build a tuple up to a given length `N`, inserting `never` for missing entries
type BuildTuple<
  T extends { [key: number]: any },
  MaxSize extends number,
  Acc extends any[] = [],
> = Acc["length"] extends MaxSize ? Acc
  : BuildTuple<
    T,
    MaxSize,
    [...Acc, Acc["length"] extends keyof T ? T[Acc["length"]] : never]
  >;

// Helper type to filter out `never` values from a tuple
type FilterNeverArray<T extends any[]> = T extends [infer First, ...infer Rest]
  ? [First] extends [never] ? FilterNeverArray<Rest>
  : [First, ...FilterNeverArray<Rest>]
  : [];

/**
 * Turns an Object whose keys are numbers into an equivalent tuple
 * WARNING: This supports objects that are missing entries (not consecutive numbers starting from 0)
 *          However, you MUST specify the maximum value in the object keys instead
 *          This is required since Typescript doesn't easily support artihmetic at the type level
 */
export type ToTupleComplex<
  T extends { [key: number]: any },
  MaxSize extends number,
> = FilterNeverArray<BuildTuple<T, MaxSize>>;
