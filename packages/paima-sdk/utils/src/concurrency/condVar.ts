import type { Operation, Resolve } from "effection";
import { action } from "effection";

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
  let continuation: null | Resolve<T> = null;

  const wait = () =>
    action<T>(function* (resolve, _reject) {
      continuation = resolve;
    });
  const wake = (val: T): void => {
    if (continuation != null) {
      const oldVal = continuation;
      continuation = null;
      oldVal(val);
    }
  };

  return { wait, wake };
}
