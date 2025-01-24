import type { Operation } from "effection";

/**
 * Equivalent of Promise.then
 */
export function* then<A, B>(
  operation: Operation<A>,
  fn: (value: A) => Operation<B>,
): Operation<B> {
  return yield* fn(yield* operation);
}

/**
 * TODO: this is a better `then` since it's much easier to chain
 * @example
export function then<A, B>(
  fn: (value: A) => Operation<B>,
): (operation: Operation<A>) => Operation<B> {
  return function* (operation) {
    return yield* fn(yield* operation);
  };
}
  * but the problem is that it relies on a `pipe` function
  * that is only available in effection v4
  * end-goal: api looks like this
  * @example
pipe(
  operation,
  then(lift((val) => val * 2)),
  then(lift((val) => String(val)),
  then(lift((val) => val.toUpperCase())),
)
*/
