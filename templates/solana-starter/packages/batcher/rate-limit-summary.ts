export interface RateLimitSummaryConfig {
  preAuthMaxRequests?: number;
  maxRequests: number;
  globalMaxRequests?: number;
  windowMs: number;
  strategy: string;
  supportsLayeredRateLimits: boolean;
}

/** Format the normalized runtime values printed when the batcher starts. */
export function formatRateLimitSummary(
  config: RateLimitSummaryConfig,
): string {
  const global = config.globalMaxRequests ?? config.maxRequests;
  if (!config.supportsLayeredRateLimits) {
    return `ratelimit: legacy-pre-auth-ip=${config.maxRequests}, ` +
      "target-global=unavailable (atomic multi-bucket consume unsupported), " +
      `window=${config.windowMs} ms, keyed by ${config.strategy}`;
  }

  const preAuth = config.preAuthMaxRequests ?? global;
  return `ratelimit: pre-auth-ip=${preAuth}, identity=${config.maxRequests}, ` +
    `target-global=${global}, window=${config.windowMs} ms, ` +
    `keyed by ${config.strategy}`;
}
