import { assertEquals } from "jsr:@std/assert";
import { test } from "@effectstream/utils/runtime";
import {
  getPrimitivesForSyncProtocol,
  onlyOnce,
  onlyNotError,
  onlyValue,
} from "./utils.ts";
import type {
  ConfigSyncProtocolType,
} from "../schema/sync-protocols/types.ts";

test("onlyOnce - returns built value", () => {
  const expected = { some: "value" };
  const result = onlyOnce({
    key: () => undefined,
    build: expected,
  });
  assertEquals(result, expected);
});

test("onlyNotError - returns built value", () => {
  const expected = { some: "value" };
  const result = onlyNotError({
    key: () => undefined,
    build: expected,
  });
  assertEquals(result, expected);
});

test("onlyValue - returns built value when targets match", () => {
  const expected = { some: "value" };
  const result = onlyValue({
    value: () => "test",
    target: () => "test",
    build: expected,
  });
  assertEquals(result, expected);
});

test("getPrimitivesForSyncProtocol - filters primitives correctly", () => {
  const primitives = {
    "prim1": { syncProtocol: "evm", primitive: {} },
    "prim2": { syncProtocol: "cardano", primitive: {} },
    "prim3": { syncProtocol: "evm", primitive: {} },
  };

  // @ts-ignore: Testing internal logic with partial mocks
  const result = getPrimitivesForSyncProtocol(primitives as any, "evm");

  assertEquals(result.length, 2);
  assertEquals(result[0].id, "prim1");
  assertEquals(result[1].id, "prim3");
  assertEquals(result[0].syncProtocol, "evm");
});

test("getPrimitivesForSyncProtocol - returns empty array for no matches", () => {
  const primitives = {
    "prim1": { syncProtocol: "evm", primitive: {} },
  };

  // @ts-ignore: Testing internal logic with partial mocks
  const result = getPrimitivesForSyncProtocol(primitives as any, "bitcoin");

  assertEquals(result.length, 0);
});

test("getPrimitivesForSyncProtocol - handles empty primitives", () => {
    // @ts-ignore: Testing internal logic
    const result = getPrimitivesForSyncProtocol({}, "evm");
    assertEquals(result.length, 0);
});
