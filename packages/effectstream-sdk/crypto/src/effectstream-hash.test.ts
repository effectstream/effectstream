import { test, expect } from "bun:test";
import { generateEffectstreamBlockHash } from "./effectstream-hash.ts";
import type { BlockHash, EffectstreamBlockHash } from "@effectstream/utils";

test("generateEffectstreamBlockHash - generates hash correctly", () => {
  const mockBlock = {
    blockInfo: [
      { blockHash: "0x123" as BlockHash },
      { blockHash: "0x456" as BlockHash }
    ]
  };
  const prevHash = "0xabc" as EffectstreamBlockHash;

  const result = generateEffectstreamBlockHash(mockBlock, prevHash);

  expect(typeof result).toEqual("string");
  expect(result.startsWith("0x")).toEqual(true);
});

test("generateEffectstreamBlockHash - handles null previous hash", () => {
    const mockBlock = {
        blockInfo: [
          { blockHash: "0x123" as BlockHash }
        ]
      };
      const prevHash = null;

      const result = generateEffectstreamBlockHash(mockBlock, prevHash);

      expect(typeof result).toEqual("string");
      expect(result.startsWith("0x")).toEqual(true);
});
