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

// Types for the result object with discriminated union
type Success<T> = {
  data: T;
  error: null;
};

type Failure<E> = {
  data: null;
  error: E;
};

type Result<T, E = Error> = Success<T> | Failure<E>;

// Main wrapper function
export function* tryYield<T, E = Error>(
  promise: Operation<T>,
): Operation<Result<T, E>> {
  try {
    const data = yield* promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}
