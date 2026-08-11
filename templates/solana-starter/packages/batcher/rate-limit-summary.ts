export interface RateLimitSummaryConfig {
  maxRequests: number;
  globalMaxRequests?: number;
  windowMs: number;
  strategy: string;
  supportsAtomicGlobalLimit: boolean;
}

/** Format the normalized runtime values printed when the batcher starts. */
export function formatRateLimitSummary(
  config: RateLimitSummaryConfig,
): string {
  const global = config.globalMaxRequests ?? config.maxRequests;
  return `ratelimit: identity=${config.maxRequests}, ` +
    `target-global=${
      config.supportsAtomicGlobalLimit
        ? global
        : "unavailable in SDK 0.102.0"
    }, window=${config.windowMs} ms, keyed by ${config.strategy}`;
}
