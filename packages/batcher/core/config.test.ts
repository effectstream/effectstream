import { test, expect } from "bun:test";
import {
  validateBatchingCriteria,
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
