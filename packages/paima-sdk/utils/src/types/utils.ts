import type { HexString0x, HexStringNo0x } from "./nominal.ts";

export type Json = null | boolean | number | string | Json[] | {
  [key: string]: Json;
};

/**
 * This is a patch for a limitation in Typescript
 * When writing functions with return types that are conditional (ex: (): T extends ... ? Foo : Bar
 * It can't easily know type narrowing in function body leads to satisfying return type constraints
 *
 * Typically, this is solved by using an `as` when using `return`:
 * ```
 * function foo<T>(foo: T): Result<T> {
 *     if (foo === ...) {
 *         return { ... } as Result<T>;  // we have to cast (`as`) to make it work
 *     }
 * }
 * ```
 * but this loses some type safety (in hides any error in the `{ ... }`
 *
 * To solve this, this function checks that
 *     the input is valid for *some* instance of the generic
 *     and then casts it to a more general instance
 *
 * TODO: we can probably delete this once Typescript 5.8 is released
 *       https://github.com/microsoft/TypeScript/pull/56941
 */
export function narrowResult<
  const General,
  const Input extends General,
  const Output extends General,
>(result: Input): Output {
  return result as unknown as Output;
}

export function strip0x(str: string): HexStringNo0x {
  if (str.startsWith("0x")) {
    return str.substring(2);
  }
  return str;
}
export function add0x(str: string): HexString0x {
  if (str.startsWith("0x")) {
    return str as `0x{string}`;
  }
  return `0x${str}`;
}

/**
 * Typed version of Object.keys()
 *
 * careful: this is dangerous.
 *          Only use when you're sure there are no other key types added dynamically
 */
export function keysOf<Key extends number | string>(
  obj: Record<Key, unknown>,
): Key[] {
  return Object.keys(obj) as Key[];
}
