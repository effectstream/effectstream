import { test, expect } from "bun:test";
import {
  applyBatcherConfigDefaults,
  DEFAULT_CONFIG_VALUES,
  validateBatchingCriteria,
  validateBatcherConfig,
  type BatchingCriteriaConfig,
} from "./config.ts";

test("validateBatchingCriteria - valid time criteria", () => {
  const criteria: BatchingCriteriaConfig = {
    criteriaType: "time",
    timeWindowMs: 1000,
  };
  validateBatchingCriteria(criteria); // Should not throw
});

test("validateBatchingCriteria - invalid time criteria", () => {
  const criteria: BatchingCriteriaConfig = {
    criteriaType: "time",
  };
  expect(
    () => validateBatchingCriteria(criteria),
  ).toThrow("timeWindowMs is required");
});

test("validateBatchingCriteria - valid size criteria", () => {
  const criteria: BatchingCriteriaConfig = {
    criteriaType: "size",
    maxBatchSize: 10,
  };
  validateBatchingCriteria(criteria);
});

test("validateBatchingCriteria - invalid size criteria", () => {
    const criteria: BatchingCriteriaConfig = {
      criteriaType: "size",
    };
    expect(
      () => validateBatchingCriteria(criteria),
    ).toThrow("maxBatchSize is required");
});

test("validateBatchingCriteria - valid hybrid criteria", () => {
    const criteria: BatchingCriteriaConfig = {
      criteriaType: "hybrid",
      timeWindowMs: 1000,
      maxBatchSize: 10,
    };
    validateBatchingCriteria(criteria);
});

test("validateBatchingCriteria - invalid hybrid criteria", () => {
    const criteria: BatchingCriteriaConfig = {
        criteriaType: "hybrid",
        timeWindowMs: 1000,
        // Missing maxBatchSize
    };
    expect(
        () => validateBatchingCriteria(criteria),
    ).toThrow("maxBatchSize is required");
});

test("partial rate-limit config receives canonical defaults and fallbacks", () => {
  const config = applyBatcherConfigDefaults({
    pollingIntervalMs: 1000,
    rateLimit: { maxRequests: 25 } as any,
  });
  expect(config.rateLimit).toEqual({
    maxRequests: 25,
    windowMs: DEFAULT_CONFIG_VALUES.rateLimit.windowMs,
  });
  // `globalMaxRequests` intentionally follows the configured identity ceiling
  // when omitted; the HTTP server resolves this as `?? maxRequests`.
  expect(
    config.rateLimit!.globalMaxRequests ?? config.rateLimit!.maxRequests,
  ).toBe(25);
  // `preAuthMaxRequests` follows the effective global ceiling when omitted.
  expect(
    config.rateLimit!.preAuthMaxRequests ??
      config.rateLimit!.globalMaxRequests ??
      config.rateLimit!.maxRequests,
  ).toBe(25);
});

test("rate-limit counts must be positive integers", () => {
  expect(() =>
    validateBatcherConfig({
      pollingIntervalMs: 1000,
      rateLimit: {
        maxRequests: 1.5,
        windowMs: 60_000,
      },
    })
  ).toThrow("rateLimit.maxRequests must be a positive integer");

  expect(() =>
    validateBatcherConfig({
      pollingIntervalMs: 1000,
      rateLimit: {
        maxRequests: 10,
        preAuthMaxRequests: 0,
        windowMs: 60_000,
      },
    })
  ).toThrow("rateLimit.preAuthMaxRequests must be a positive integer");

  expect(() =>
    validateBatcherConfig({
      pollingIntervalMs: 1000,
      rateLimit: {
        maxRequests: 10,
        globalMaxRequests: 0,
        windowMs: 60_000,
      },
    })
  ).toThrow("rateLimit.globalMaxRequests must be a positive integer");
});
