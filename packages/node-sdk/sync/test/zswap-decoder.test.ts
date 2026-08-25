import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import {
  decodeZswapEvent,
  ZswapEventDecodeError,
} from "../src/sync-protocols/midnight/zswap-decoder.ts";

// Synthetic events built per the midnight-ledger 9.x wire format:
// "midnight:event[v14]:" tag + TopoSortedNodes envelope wrapping the event
// struct. Both blobs round-trip through the native ledger-v9 deserializer.

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
    Buffer.from("midnight:event[v14]:", "ascii"),
    compactU32(1), // node count
    compactU32(0), // child count of the single node
    compactU32(data.length),
    data,
  ]).toString("hex");
}

const NULLIFIER_RAW = wrapEnvelope(Buffer.concat([
  TX_HASH,
  SEGMENTS,
  Buffer.from([0x00]),
  BODY32,
  CONTRACT_NONE,
]));

function expectDecodeFailure(raw: string): void {
  try {
    decodeZswapEvent(raw);
    throw new Error("expected decodeZswapEvent to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(ZswapEventDecodeError);
    expect((error as ZswapEventDecodeError).rawHex).toBe(raw);
    expect(String(error)).toContain("ledger-v9");
    expect(String(error)).toContain("protocolVersion 2000000");
  }
}

describe("decodeZswapEvent", () => {
  test("decodes a ZswapInput (nullifier) event", () => {
    expect(decodeZswapEvent(NULLIFIER_RAW)).toEqual({
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

  test("fails explicitly for undecodable input", () => {
    for (const raw of ["deadbeef", ""]) {
      expectDecodeFailure(raw);
    }
  });

  test("rejects non-hex semantic bytes, invalid suffixes, and odd length", () => {
    const nullifier = "bb".repeat(32);
    const semanticByte = NULLIFIER_RAW.replace(
      nullifier,
      `zz${"bb".repeat(31)}`,
    );
    expect(semanticByte).not.toBe(NULLIFIER_RAW);

    for (const raw of [semanticByte, `${NULLIFIER_RAW}zz`, `${NULLIFIER_RAW}0`]) {
      expectDecodeFailure(raw);
    }
  });
});
