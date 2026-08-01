import { Type } from "@sinclair/typebox";

export const midnightNullifierAndCommitmentGrammar = [
  [
    "payload",
    Type.Union([
      Type.Object({
        kind: Type.Literal("nullifier"),
        /** 32-byte nullifier, hex (no 0x prefix) */
        nullifier: Type.String(),
        /** 32-byte transaction hash, hex (no 0x prefix) */
        txHash: Type.String(),
        /** Indexer-assigned zswap ledger event id */
        eventId: Type.Number(),
        /** Logical segment the event was emitted in */
        logicalSegment: Type.Number(),
        /** Contract address that spent the coin, hex — absent for user coins */
        contract: Type.Optional(Type.String()),
      }),
      Type.Object({
        kind: Type.Literal("commitment"),
        /** 32-byte coin commitment, hex (no 0x prefix) */
        commitment: Type.String(),
        /** Index of the commitment in the zswap Merkle tree (u64 as decimal string) */
        mtIndex: Type.String(),
        /** 32-byte transaction hash, hex (no 0x prefix) */
        txHash: Type.String(),
        /** Indexer-assigned zswap ledger event id */
        eventId: Type.Number(),
        /** Logical segment the event was emitted in */
        logicalSegment: Type.Number(),
        /** Contract address that received the coin, hex — absent for user coins */
        contract: Type.Optional(Type.String()),
      }),
    ]),
  ],
] as const;
