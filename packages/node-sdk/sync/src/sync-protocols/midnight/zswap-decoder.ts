import * as ledger from '@midnightntwrk/ledger-v9';
import { strictHexToBytes } from "./strict-hex.ts";

// Wire format of a raw zswap ledger event, for reference (midnight-ledger 9.x,
// `midnight-ledger/ledger/src/events.rs` + `storage-core/src/arena.rs`):
//
//   20 bytes  outer tag "midnight:event[v14]:"
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

/** A zswap ledger event decoded via the native ledger-v9 bindings. */
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

export class ZswapEventDecodeError extends Error {
  override readonly name = "ZswapEventDecodeError";

  constructor(
    message: string,
    readonly rawHex: string,
    readonly decodeCause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Decode a raw zswap ledger event (ZswapInput or ZswapOutput) using the
 * native ledger-v9 WASM deserializer. The indexer's `zswapLedgerEvents`
 * field only ever carries these two variants. A deserialization or variant
 * mismatch is a hard error: silently skipping it would permanently omit a
 * nullifier or commitment from the synchronized state.
 */
export function decodeZswapEvent(rawHex: string): DecodedZswapEvent {
  let event: ledger.Event;
  try {
    event = ledger.Event.deserialize(strictHexToBytes(rawHex));
  } catch (decodeCause) {
    throw new ZswapEventDecodeError(
      `ledger-v9 could not deserialize protocolVersion 2000000 zswap event: ${
        (decodeCause as Error)?.message ?? String(decodeCause)
      }`,
      rawHex,
      decodeCause,
    );
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
  throw new ZswapEventDecodeError(
    `ledger-v9 returned unexpected zswap event variant "${content.tag}" for protocolVersion 2000000`,
    rawHex,
  );
}
