import { assertEquals, assertThrows } from "jsr:@std/assert";
import { test } from "@effectstream/utils/runtime";
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
  assertThrows(
    () => validateBatchingCriteria(criteria),
    Error,
    "timeWindowMs is required"
  );
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
    assertThrows(
      () => validateBatchingCriteria(criteria),
      Error,
      "maxBatchSize is required"
    );
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
    assertThrows(
        () => validateBatchingCriteria(criteria),
        Error,
        "maxBatchSize is required"
    );
});

