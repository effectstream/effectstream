import { assertEquals } from "jsr:@std/assert";
import { test } from "@effectstream/utils/runtime";
import { binarySearch } from "./binary-search.ts";

test("binarySearch - finds exact match", () => {
  const arr = [1, 3, 5, 7, 9];
  const result = binarySearch(arr, 5, (val) => val);
  assertEquals(result, 2);
});

test("binarySearch - finds closest value >= target", () => {
  const arr = [1, 3, 5, 7, 9];
  const result = binarySearch(arr, 6, (val) => val);
  assertEquals(result, 3);
});

test("binarySearch - returns 0 if target is smaller than all elements", () => {
  const arr = [1, 3, 5, 7, 9];
  const result = binarySearch(arr, 0, (val) => val);
  assertEquals(result, 0);
});

test("binarySearch - returns undefined if target is larger than all elements", () => {
  const arr = [1, 3, 5, 7, 9];
  const result = binarySearch(arr, 10, (val) => val);
  assertEquals(result, undefined);
});

test("binarySearch - returns undefined for empty array", () => {
  const arr: number[] = [];
  const result = binarySearch(arr, 5, (val) => val);
  assertEquals(result, undefined);
});

test("binarySearch - works with custom projection function", () => {
  const arr = [{ id: 10 }, { id: 20 }, { id: 30 }];
  const result = binarySearch(arr, 20, (val) => val.id);
  assertEquals(result, 1);
});

