// Examples for the README.

import { test, expect } from "bun:test";
import {
  genV1BlockHeader,
  hashBlockV1,
  hashRollupInput,
  hashTransactions,
} from "../src/mod.ts";
import type { BlockNumber, Caip2, HexStringNo0x, TimestampMs } from "@effectstream/utils";

test("README: genV1BlockHeader produces a deterministic block header", () => {
  const header = genV1BlockHeader(
    {
      blockHash: "abcd" as HexStringNo0x,
      blockHeight: 42 as BlockNumber,
      msTimestamp: 1715731200_000 as TimestampMs,
    },
    null,
    ["tx-1"],
    [],
  );

  expect(header.version).toBe(1);
  expect(header.blockHeight).toBe(42 as BlockNumber);
  expect(header.successTxsHash).toBe(hashTransactions.hash(["tx-1"]));
  expect(header.failedTxsHash).toBe(hashTransactions.hash([]));
});

test("README: hashBlockV1.hash is deterministic and 64 hex chars", () => {
  const header = genV1BlockHeader(
    {
      blockHash: "abcd" as HexStringNo0x,
      blockHeight: 1 as BlockNumber,
      msTimestamp: 0 as TimestampMs,
    },
    null,
    [],
    [],
  );

  const h1 = hashBlockV1.hash(header);
  const h2 = hashBlockV1.hash(header);
  expect(h1).toBe(h2);
  expect(h1).toMatch(/^[0-9a-f]{64}$/);
});

test("README: hashRollupInput.hash is keccak256 of the canonical preHash", () => {
  const info = {
    caip2Prefix: "eip155:1" as Caip2,
    txHash: "deadbeef" as HexStringNo0x,
    indexInBlock: 0,
  };
  const h = hashRollupInput.hash(info);
  expect(h).toMatch(/^[0-9a-f]{64}$/);
});
