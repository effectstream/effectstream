import type { Operation } from "effection";
import { action, race, sleep, spawn } from "effection";
import { conditionVariable } from "./condVar.ts";

/**
 * Allow blocking execution until counted down N times
 *
 * @example
 * ```javascript
 * const { wait, countDown } = countdownLatch(2);
 * yield* spawn(function* () {
 *   yield* wait();
 *   console.log("done");
 * });
 *
 * yield* sleep(1000);
 * countDown();
 * yield* sleep(1000);
 * countDown();
 * ```
 *
 * See [Barrier](https://en.wikipedia.org/wiki/Barrier_%28computer_science%29) for more information
 */
export function countdownLatch<T>(
  count: number,
): {
  wait: (timeout?: number) => Operation<void>;
  countDown: () => void;
} {
  const vars = new Array(count).fill(null).map(() => conditionVariable<void>());
  let currIndex = 0;

  const wait = (timeout?: number) =>
    action<void>(function* (resolve, reject) {
      // note: start at `currIndex` and not 0
      //       this is to support waiting on latches that have already started
      const waitAll = yield* spawn(function* () {
        for (let i = currIndex; i < count; i++) {
          yield* vars[i].wait();
        }
        resolve();
      });
      if (timeout == null) return yield* waitAll;

      const rejectOnTimeout = yield* spawn(function* (): Operation<void> {
        yield* sleep(timeout);
        reject(new Error("timeout"));
      });
      yield* race([waitAll, rejectOnTimeout]);
    });
  const countDown = (): void => {
    if (currIndex >= count) {
      return;
    }
    const oldValue = currIndex;
    currIndex++;
    vars[oldValue].wake();
  };

  return { wait, countDown };
}
