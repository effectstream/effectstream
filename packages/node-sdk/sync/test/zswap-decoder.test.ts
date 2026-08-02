import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { decodeZswapEvent } from "../src/sync-protocols/midnight/zswap-decoder.ts";

// Synthetic events built per the real midnight-ledger 8.x wire format:
// "midnight:event[v9]:" tag + TopoSortedNodes envelope wrapping the event
// struct. Both blobs round-trip through the native ledger-v8 deserializer.

function compactU32(n: number): Buffer {
  if (n < 64) return Buffer.from([n << 2]);
  if (n < 16384) {
    const v = (n << 2) | 0b01;
    return Buffer.from([v & 0xff, (v >> 8) & 0xff]);
  }
  throw new Error("value too large for this helper");
}

const TX_HASH = Buffer.alloc(32, 0xaa);
const BODY32 = Buffer.alloc(32, 0xbb);
// logical=3, physical=1
const SEGMENTS = Buffer.from([0x03, 0x00, 0x01, 0x00]);
const CONTRACT_NONE = Buffer.from([0x01]);

function wrapEnvelope(data: Buffer): string {
  return Buffer.concat([
    Buffer.from("midnight:event[v9]:", "ascii"),
    compactU32(1), // node count
    compactU32(0), // child count of the single node
    compactU32(data.length),
    data,
  ]).toString("hex");
}

describe("decodeZswapEvent", () => {
  test("decodes a ZswapInput (nullifier) event", () => {
    const raw = wrapEnvelope(Buffer.concat([
      TX_HASH,
      SEGMENTS,
      Buffer.from([0x00]), // variant: ZswapInput
      BODY32, // nullifier
      CONTRACT_NONE,
    ]));
    expect(decodeZswapEvent(raw)).toEqual({
      kind: "nullifier",
      nullifier: "bb".repeat(32),
      txHash: "aa".repeat(32),
      logicalSegment: 3,
    });
  });

  test("decodes a ZswapOutput (commitment) event", () => {
    const raw = wrapEnvelope(Buffer.concat([
      TX_HASH,
      SEGMENTS,
      Buffer.from([0x01]), // variant: ZswapOutput
      BODY32, // commitment
      Buffer.from([0x02]), // ZswapPreimageEvidence::None
      CONTRACT_NONE,
      compactU32(7), // mt_index
    ]));
    expect(decodeZswapEvent(raw)).toEqual({
      kind: "commitment",
      commitment: "bb".repeat(32),
      mtIndex: "7",
      txHash: "aa".repeat(32),
      logicalSegment: 3,
    });
  });

  test("returns null for undecodable input", () => {
    expect(decodeZswapEvent("deadbeef")).toBeNull();
    expect(decodeZswapEvent("")).toBeNull();
  });
});
