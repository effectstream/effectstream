import type { Operation, Resolve, Scope, Task } from "effection";
import { action, useScope } from "effection";

export type CondVar<T> = {
  wait: () => Operation<T>;
  wake: (val: T) => void;
};

/**
 * Allows blocking execution until a specific wake is called
 *
 * @example
 * ```javascript
 * const { wait, wake } = conditionVariable<void>();
 * yield* spawn(function*() {
 *     console.log('start wait');
 *     yield* wait();
 *     console.log('done wait');
 * });
 *
 * yield* sleep(1000);
 * wait(); // allows the spawn to continue executing
 * ```
 *
 * See [Condition variables](https://en.wikipedia.org/wiki/Monitor_%28synchronization%29#Condition_variables) for more information
 */
export function conditionVariable<T>(): CondVar<T> {
  let continuations: {
    resolve: Resolve<T>;
    scope: Scope;
  }[] = [];

  const wait = function* () {
    const scope = yield* useScope();
    return yield* action<T>(function* (resolve, _reject) {
      continuations.push({ resolve, scope });
    });
  };

  const wake = (val: T): void => {
    const oldVal = continuations;
    continuations = [];
    for (const continuation of oldVal) {
      continuation.scope.run(function* () {
        continuation.resolve(val);
      });
    }
  };

  return { wait, wake };
}
