import * as ledger from '@midnight-ntwrk/ledger-v8';

// Wire format of a raw zswap ledger event, for reference (midnight-ledger 8.x,
// `midnight-ledger/ledger/src/events.rs` + `storage-core/src/arena.rs`):
//
//   19 bytes  outer tag "midnight:event[v9]:"
//   then a TopoSortedNodes envelope (NOT the struct directly):
//     compact_u32 node count, and per node: compact_u32 child count,
//     compact_u64 child indices, compact_u32 data length, data bytes.
//   The root node's data is:
//     32 bytes  EventSource.transaction_hash
//      2 bytes  logical_segment  (LE u16)
//      2 bytes  physical_segment (LE u16)
//      1 byte   EventDetails variant: 0=ZswapInput, 1=ZswapOutput, 2+=other
//     ZswapInput:  32-byte nullifier  + Option<Sp<ContractAddress>> byte
//     ZswapOutput: 32-byte commitment + variable-length preimage evidence
//                  + Option<Sp<ContractAddress>> byte + compact_u64 mt_index
//   A Some(..) contract address is a SEPARATE node in the envelope, shifting
//   all offsets — so positional parsing is not viable; always deserialize via
//   the ledger bindings.

function normalizeHex(hex: string): string {
  return (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

/** A zswap ledger event decoded via the native ledger-v8 bindings. */
export type DecodedZswapEvent =
  | {
    kind: "nullifier";
    /** 32-byte nullifier, hex */
    nullifier: string;
    /** 32-byte transaction hash, hex */
    txHash: string;
    /** Logical segment index */
    logicalSegment: number;
    /** Contract address that spent the coin, hex — absent for user coins */
    contract?: string;
  }
  | {
    kind: "commitment";
    /** 32-byte coin commitment, hex */
    commitment: string;
    /** Index of the commitment in the zswap Merkle tree, u64 as decimal string */
    mtIndex: string;
    /** 32-byte transaction hash, hex */
    txHash: string;
    /** Logical segment index */
    logicalSegment: number;
    /** Contract address that received the coin, hex — absent for user coins */
    contract?: string;
  };

/**
 * Decode a raw zswap ledger event (ZswapInput or ZswapOutput) using the
 * native ledger-v8 WASM deserializer.  The indexer's `zswapLedgerEvents`
 * field only ever carries these two variants, so a `null` return means the
 * event could not be decoded (e.g. a ledger event-format version bump) and
 * is logged.
 */
export function decodeZswapEvent(rawHex: string): DecodedZswapEvent | null {
  let event: ledger.Event;
  try {
    event = ledger.Event.deserialize(hexToBytes(rawHex));
  } catch (err) {
    console.warn(
      "[midnight] failed to deserialize zswap ledger event — ledger event format may have changed",
      { raw: rawHex, error: String(err) },
    );
    return null;
  }
  // EventDetails is an open union ({ tag: string } catch-all), so narrow manually.
  const content = event.content as {
    tag: string;
    nullifier?: string;
    commitment?: string;
    contract?: string;
    mtIndex?: bigint;
  };
  const source = {
    txHash: normalizeHex(event.source.transactionHash),
    logicalSegment: event.source.logicalSegment,
  };
  const contract = content.contract != null
    ? { contract: normalizeHex(content.contract) }
    : {};
  if (content.tag === "zswapInput" && content.nullifier != null) {
    return {
      kind: "nullifier",
      nullifier: normalizeHex(content.nullifier),
      ...contract,
      ...source,
    };
  }
  if (
    content.tag === "zswapOutput" &&
    content.commitment != null &&
    content.mtIndex != null
  ) {
    return {
      kind: "commitment",
      commitment: normalizeHex(content.commitment),
      mtIndex: content.mtIndex.toString(),
      ...contract,
      ...source,
    };
  }
  console.warn(
    "[midnight] unexpected zswap ledger event variant",
    { raw: rawHex, tag: content.tag },
  );
  return null;
}
