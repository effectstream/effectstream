import type { ChainBlock } from "@paima/sync";
import type { BlockHash, PaimaBlockHash } from "@paima/utils";
import crypto from "node:crypto";

/**
 * Calculates a Paima block hash based on the captured.
 * @param chainBlock - The chain block to hash.
 * @param previousBlockHash - The previous block hash.
 * @returns The Paima block hash.
 */
export function generatePaimaBlockHash(
  chainBlock: ChainBlock,
  previousBlockHash: PaimaBlockHash | null,
): PaimaBlockHash {
  const hashes: BlockHash[] = chainBlock.blockHashes.map((h) => h.blockHashes);

  let hash: PaimaBlockHash = previousBlockHash ?? "0x0";

  for (const h of hashes) {
    const s = hash + h;
    hash = `0x${crypto.hash("sha512", s, "hex")}` as PaimaBlockHash;
  }

  return hash;
}
