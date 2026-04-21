import type { BlockHash, EffectstreamBlockHash } from "@effectstream/utils";
import crypto from "node:crypto";

/**
 * Calculates the Paima block hash based on the captured blocks, and previous block hash.
 * @param chainBlock - The chain block to hash.
 * @param previousBlockHash - The previous block hash.
 * @returns The Paima block hash.
 */
export function generateEffectstreamBlockHash(
  chainBlock: { blockInfo: { blockHash: BlockHash }[] }, // ChainBlock,
  previousBlockHash: EffectstreamBlockHash | null,
): EffectstreamBlockHash {
  const hashes: BlockHash[] = chainBlock.blockInfo.map((h) => h.blockHash);
  const hashString: string = [previousBlockHash ?? "0x0", ...hashes].join("");
  return `0x${crypto.hash("sha512", hashString, "hex")}` as EffectstreamBlockHash;
}
