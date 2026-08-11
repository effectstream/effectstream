import { expect, test } from "bun:test";
import { formatRateLimitSummary } from "./rate-limit-summary.ts";

test("summary reports normalized identity and target-global limits", () => {
  expect(formatRateLimitSummary({
    preAuthMaxRequests: 2000,
    maxRequests: 100,
    globalMaxRequests: 1000,
    windowMs: 60_000,
    strategy: "ip-and-address",
    supportsLayeredRateLimits: true,
  })).toBe(
    "ratelimit: pre-auth-ip=2000, identity=100, target-global=1000, window=60000 ms, keyed by ip-and-address",
  );
});

test("summary reports the pinned SDK limitation instead of inventing a cap", () => {
  expect(formatRateLimitSummary({
    maxRequests: 100_000,
    windowMs: 60_000,
    strategy: "ip",
    supportsLayeredRateLimits: false,
  })).toBe(
    "ratelimit: legacy-pre-auth-ip=100000, target-global=unavailable (atomic multi-bucket consume unsupported), window=60000 ms, keyed by ip",
  );
});
