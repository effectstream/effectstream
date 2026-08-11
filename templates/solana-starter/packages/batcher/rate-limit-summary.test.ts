import { expect, test } from "bun:test";
import { formatRateLimitSummary } from "./rate-limit-summary.ts";

test("summary reports normalized identity and target-global limits", () => {
  expect(formatRateLimitSummary({
    maxRequests: 100,
    globalMaxRequests: 1000,
    windowMs: 60_000,
    strategy: "ip-and-address",
    supportsAtomicGlobalLimit: true,
  })).toBe(
    "ratelimit: identity=100, target-global=1000, window=60000 ms, keyed by ip-and-address",
  );
});

test("summary reports the pinned SDK limitation instead of inventing a cap", () => {
  expect(formatRateLimitSummary({
    maxRequests: 100_000,
    windowMs: 60_000,
    strategy: "ip",
    supportsAtomicGlobalLimit: false,
  })).toBe(
    "ratelimit: identity=100000, target-global=unavailable in SDK 0.102.0, window=60000 ms, keyed by ip",
  );
});
