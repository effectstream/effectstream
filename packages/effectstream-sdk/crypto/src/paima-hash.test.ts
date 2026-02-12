import { assertEquals } from "jsr:@std/assert";
import { generatePaimaBlockHash } from "./paima-hash.ts";
import type { BlockHash, PaimaBlockHash } from "@effectstream/utils";
import { test } from "@effectstream/utils/runtime";

test("generatePaimaBlockHash - generates hash correctly", () => {
  const mockBlock = {
    blockInfo: [
      { blockHash: "0x123" as BlockHash },
      { blockHash: "0x456" as BlockHash }
    ]
  };
  const prevHash = "0xabc" as PaimaBlockHash;

  const result = generatePaimaBlockHash(mockBlock, prevHash);
  
  assertEquals(typeof result, "string");
  assertEquals(result.startsWith("0x"), true);
});

test("generatePaimaBlockHash - handles null previous hash", () => {
    const mockBlock = {
        blockInfo: [
          { blockHash: "0x123" as BlockHash }
        ]
      };
      const prevHash = null;
    
      const result = generatePaimaBlockHash(mockBlock, prevHash);
      
      assertEquals(typeof result, "string");
      assertEquals(result.startsWith("0x"), true);
});

