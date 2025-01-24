import type { Operation } from "effection";

export function* retry<Success, Failure = Success>(
  fn: () => Operation<Success | Failure>,
  isSuccess: (result: Success | Failure) => boolean,
  onRetry?: (failResult: Failure) => Operation<void>,
  maxAttempts?: number,
): Operation<Success> {
  return yield* retryInternal<Success, Failure>(
    fn,
    isSuccess,
    0,
    onRetry,
    maxAttempts,
  );
}
function* retryInternal<Success, Failure = Success>(
  fn: () => Operation<Success | Failure>,
  isSuccess: (result: Success | Failure) => boolean,
  currAttempt: number,
  onRetry?: (failResult: Failure) => Operation<void>,
  maxAttempts?: number,
): Operation<Success> {
  const result = yield* fn();

  if (isSuccess(result)) {
    return result as Success;
  }
  if (onRetry != null) {
    yield* onRetry(result as Failure);
  }
  if (maxAttempts == null || currAttempt !== maxAttempts) {
    return yield* retryInternal<Success, Failure>(
      fn,
      isSuccess,
      currAttempt + 1,
      onRetry,
      maxAttempts,
    );
  }
  throw new Error("Max attempts reached");
}
