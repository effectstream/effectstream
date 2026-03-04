import { Buffer } from "node:buffer";
import * as ledger from '@midnight-ntwrk/ledger-v7';

// TODO This alternative implementation should be the native way to decode the event.
function new_decodeZswapInputEvent(rawHex: string): ledger.Event | null {
  try {
    const bytes = Uint8Array.from(
      Buffer.from(rawHex.replace(/^0x/, ""), "hex"),
    );
    const event = ledger.Event.deserialize(bytes);

    if (event.type === "ZswapInput") {
      // event.nullifier  — Uint8Array (32 bytes)
      // event.source.transactionHash
      // event.source.logicalSegment
    } else if (event.type === "ZswapOutput") {
      // event.commitment, etc.
    }
  } catch {
    return null;
  }
}

// ─── SCALE compact integer decoder ───────────────────────────────────────────
//
// Bottom 2 bits of the first byte are the mode:
//   00 = 1-byte  (value in bits [7:2])
//   01 = 2-byte
//   10 = 4-byte
//   11 = n-byte length prefix

function readScaleU32(b: Uint8Array, pos: number): [number, number] {
  const first = b[pos];
  const mode = first & 0b11;
  if (mode === 0b00) {
    return [(first & 0xFC) >> 2, pos + 1];
  } else if (mode === 0b01) {
    const second = b[pos + 1];
    const v0 = ((first & 0xFC) >> 2) | ((second & 0x03) << 6);
    const v1 = (second & 0xFC) >> 2;
    return [(v0 | (v1 << 8)) >>> 0, pos + 2];
  } else if (mode === 0b10) {
    const s = b[pos + 1], t = b[pos + 2], u = b[pos + 3];
    const v0 = ((first & 0xFC) >> 2) | ((s & 0x03) << 6);
    const v1 = ((s & 0xFC) >> 2) | ((t & 0x03) << 6);
    const v2 = ((t & 0xFC) >> 2) | ((u & 0x03) << 6);
    const v3 = (u & 0xFC) >> 2;
    return [(v0 | (v1 << 8) | (v2 << 16) | (v3 << 24)) >>> 0, pos + 4];
  } else {
    const n = ((first & 0xFC) >> 2) + 4;
    let val = 0;
    for (let i = 0; i < n; i++) val |= b[pos + 1 + i] << (i * 8);
    return [val >>> 0, pos + 1 + n];
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Binary layout for "midnight:event[v9]:" ─────────────────────────────────
//   19 bytes   outer tag "midnight:event[v9]:"
//   32 bytes   EventSource.transaction_hash
//    2 bytes   EventSource.logical_segment  (LE u16)
//    2 bytes   EventSource.physical_segment (LE u16, skipped)
//   SCALE u32  EventDetails variant: 0=ZswapInput, 1=ZswapOutput, 2+=other
//
//   ZswapInput: 4-byte contract_id + 32-byte CoinNullifier

const OUTER_TAG = "midnight:event[v9]:";

export interface DecodedZswapInput {
  /** 32-byte transaction hash, hex */
  txHash: string;
  /** Logical segment index */
  logicalSegment: number;
  /** 32-byte nullifier, hex */
  nullifier: string;
}

/**
 * Decode a raw SCALE-encoded zswap ledger event.
 * Returns the decoded data if the event is a ZswapInput (nullifier spend),
 * or `null` for ZswapOutput / other variants.
 */
export function decodeZswapInputEvent(
  rawHex: string,
): DecodedZswapInput | null {
  try {
    const b = hexToBytes(rawHex);
    let pos = OUTER_TAG.length;

    const txHash = bytesToHex(b.slice(pos, pos + 32));
    pos += 32;
    const logicalSegment = b[pos] | (b[pos + 1] << 8);
    pos += 2;
    pos += 2; // skip physical segment

    const [variant, p1] = readScaleU32(b, pos);
    pos = p1;

    if (variant !== 0) {
      return null; // ZswapOutput or other — not a nullifier event
    }

    pos += 4; // skip 4-byte contract_id

    const nullifier = bytesToHex(b.slice(pos, pos + 32));
    return { txHash, logicalSegment, nullifier };
  } catch {
    return null;
  }
}
