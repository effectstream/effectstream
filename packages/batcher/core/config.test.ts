import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  validateBatchingCriteria,
  type BatchingCriteriaConfig,
} from "./config.ts";

Deno.test("validateBatchingCriteria - valid time criteria", () => {
  const criteria: BatchingCriteriaConfig = {
    criteriaType: "time",
    timeWindowMs: 1000,
  };
  validateBatchingCriteria(criteria); // Should not throw
});

Deno.test("validateBatchingCriteria - invalid time criteria", () => {
  const criteria: BatchingCriteriaConfig = {
    criteriaType: "time",
  };
  assertThrows(
    () => validateBatchingCriteria(criteria),
    Error,
    "timeWindowMs is required"
  );
});

Deno.test("validateBatchingCriteria - valid size criteria", () => {
  const criteria: BatchingCriteriaConfig = {
    criteriaType: "size",
    maxBatchSize: 10,
  };
  validateBatchingCriteria(criteria);
});

Deno.test("validateBatchingCriteria - invalid size criteria", () => {
    const criteria: BatchingCriteriaConfig = {
      criteriaType: "size",
    };
    assertThrows(
      () => validateBatchingCriteria(criteria),
      Error,
      "maxBatchSize is required"
    );
});

Deno.test("validateBatchingCriteria - valid hybrid criteria", () => {
    const criteria: BatchingCriteriaConfig = {
      criteriaType: "hybrid",
      timeWindowMs: 1000,
      maxBatchSize: 10,
    };
    validateBatchingCriteria(criteria);
});

Deno.test("validateBatchingCriteria - invalid hybrid criteria", () => {
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

