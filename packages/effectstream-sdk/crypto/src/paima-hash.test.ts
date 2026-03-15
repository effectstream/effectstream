import { test, expect } from "bun:test";
import { generatePaimaBlockHash } from "./paima-hash.ts";
import type { BlockHash, PaimaBlockHash } from "@effectstream/utils";

test("generatePaimaBlockHash - generates hash correctly", () => {
  const mockBlock = {
    blockInfo: [
      { blockHash: "0x123" as BlockHash },
      { blockHash: "0x456" as BlockHash }
    ]
  };
  const prevHash = "0xabc" as PaimaBlockHash;

  const result = generatePaimaBlockHash(mockBlock, prevHash);

  expect(typeof result).toEqual("string");
  expect(result.startsWith("0x")).toEqual(true);
});

test("generatePaimaBlockHash - handles null previous hash", () => {
    const mockBlock = {
        blockInfo: [
          { blockHash: "0x123" as BlockHash }
        ]
      };
      const prevHash = null;

      const result = generatePaimaBlockHash(mockBlock, prevHash);

      expect(typeof result).toEqual("string");
      expect(result.startsWith("0x")).toEqual(true);
});
