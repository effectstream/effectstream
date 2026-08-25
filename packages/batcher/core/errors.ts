/**
 * Error types shared across the batcher core.
 *
 * These live outside `batcher.ts` so modules it imports — the batch processor,
 * for instance — can throw and recognise them without an import cycle. The
 * HTTP layer branches on `instanceof`, so there must be exactly one class
 * identity: never redeclare these locally.
 */

/**
 * An input was refused, with the status and stable code the caller should see.
 *
 * Raised both at intake, before an input is queued, and later when a queued
 * input turns out to be unprocessable.
 */
export class InputValidationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    /**
     * Stable, machine-readable reason. Clients should branch on this rather
     * than on `message`, whose text can include detail derived from the
     * submitted input.
     */
    public errorCode?: string,
    /** True when re-submitting the identical input could later succeed. */
    public retryable?: boolean,
  ) {
    super(message);
    this.name = "InputValidationError";
  }
}

/**
 * An accepted input reached a definitive unsuccessful terminal state.
 *
 * This is deliberately not an {@link InputValidationError}: intake succeeded,
 * the request was queued and submitted, and the chain later mined a reverted
 * transaction. SDK and HTTP callers receive the same stable terminal verdict.
 */
export class InputTerminalError extends Error {
  public readonly statusCode = 422;
  public readonly errorCode = "ONCHAIN_FAILED";
  public readonly retryable = false;

  constructor(
    message: string,
    public readonly requestId: string,
    public readonly transactionHash: string,
  ) {
    super(message);
    this.name = "InputTerminalError";
  }
}
