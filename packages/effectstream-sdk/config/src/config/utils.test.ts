import { test, expect } from "bun:test";
import {
  getPrimitivesForSyncProtocol,
  onlyOnce,
  onlyNotError,
  onlyValue,
} from "./utils.ts";

test("onlyOnce - returns built value", () => {
  const expected = { some: "value" };
  const result = onlyOnce({
    key: () => undefined,
    build: expected,
  });
  expect(result).toEqual(expected);
});

test("onlyNotError - returns built value", () => {
  const expected = { some: "value" };
  const result = onlyNotError({
    key: () => undefined,
    build: expected,
  });
  expect(result).toEqual(expected);
});

test("onlyValue - returns built value when targets match", () => {
  const expected = { some: "value" };
  const result = onlyValue({
    value: () => "test",
    target: () => "test",
    build: expected,
  });
  expect(result).toEqual(expected);
});

test("getPrimitivesForSyncProtocol - filters primitives correctly", () => {
  const primitives = {
    "prim1": { syncProtocol: "evm", primitive: {} },
    "prim2": { syncProtocol: "cardano", primitive: {} },
    "prim3": { syncProtocol: "evm", primitive: {} },
  };

  // @ts-ignore: Testing internal logic with partial mocks
  const result = getPrimitivesForSyncProtocol(primitives as any, "evm");

  expect(result.length).toEqual(2);
  expect(result[0].id).toEqual("prim1");
  expect(result[1].id).toEqual("prim3");
  expect(result[0].syncProtocol).toEqual("evm");
});

test("getPrimitivesForSyncProtocol - returns empty array for no matches", () => {
  const primitives = {
    "prim1": { syncProtocol: "evm", primitive: {} },
  };

  // @ts-ignore: Testing internal logic with partial mocks
  const result = getPrimitivesForSyncProtocol(primitives as any, "bitcoin");

  expect(result.length).toEqual(0);
});

test("getPrimitivesForSyncProtocol - handles empty primitives", () => {
    // @ts-ignore: Testing internal logic
    const result = getPrimitivesForSyncProtocol({}, "evm");
    expect(result.length).toEqual(0);
});
