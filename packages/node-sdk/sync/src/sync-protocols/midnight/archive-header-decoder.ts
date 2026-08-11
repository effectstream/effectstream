/**
 * Decodes the two block-level values effectstream needs that UmbraDB's core schema does not store
 * as columns: the **protocol version** and the **block timestamp**. Both are recovered from the
 * header and body blobs the archive already keeps.
 *
 * **Blob format matters.** UmbraDB does not archive on-wire SCALE bytes for the header — Substrate's
 * JSON-RPC layer decodes the header into named fields before returning it, and there is no
 * `chain_getHeaderBytes` equivalent. The archive therefore stores a deterministic **canonical JSON**
 * serialisation of exactly what the node returned (its `stableStringify`). So: parse the blob as
 * JSON first, then SCALE-decode the hex strings inside it. Treating the blob as raw SCALE yields
 * garbage that sometimes parses, which is worse than failing.
 *
 * Everything here classifies by **dispatched call** (pallet + call index), never by argument shape.
 * A call whose first argument merely looks like a plausible moment is not the timestamp inherent.
 */

/** SCALE compact integer at `offset`. Mode 3 (big-integer) is supported up to
 *  `Number.MAX_SAFE_INTEGER` and throws beyond it rather than silently truncating — block
 *  timestamps in ms (~1.8e12) sit four orders of magnitude inside that bound. */
export function decodeCompact(bytes: Uint8Array, offset: number): { value: number; size: number } {
  if (offset >= bytes.length) throw new Error("decodeCompact: offset past end of input");
  const first = bytes[offset]!;
  const mode = first & 0b11;
  if (mode === 0) return { value: first >>> 2, size: 1 };
  if (mode === 1) {
    if (offset + 2 > bytes.length) throw new Error("decodeCompact: truncated two-byte compact");
    return { value: (first | (bytes[offset + 1]! << 8)) >>> 2, size: 2 };
  }
  if (mode === 2) {
    if (offset + 4 > bytes.length) throw new Error("decodeCompact: truncated four-byte compact");
    const raw = (first | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
    return { value: raw >>> 2, size: 4 };
  }
  const count = (first >>> 2) + 4;
  if (offset + 1 + count > bytes.length) throw new Error("decodeCompact: truncated big-integer compact");
  let value = 0;
  for (let i = count - 1; i >= 0; i--) value = value * 256 + bytes[offset + 1 + i]!;
  if (!Number.isSafeInteger(value)) throw new Error("decodeCompact: value exceeds MAX_SAFE_INTEGER");
  return { value, size: 1 + count };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

/** Engine id of Midnight's protocol-version consensus digest item: ASCII "MNSV". */
const MNSV = [0x4d, 0x4e, 0x53, 0x56];

/**
 * Protocol version from a header's `digest.logs`, or `undefined` if no usable MNSV item is present.
 *
 * Item layout (verified against real devnet digests, e.g. `0x044d4e53561040420f00`):
 * `0x04` Consensus variant | 4-byte engine id `MNSV` | compact `Vec<u8>` length | little-endian u32.
 * A digest carries unrelated items too (`aura` PreRuntime, `BEEF` Consensus, `aura` Seal); they are
 * skipped, and a truncated item is skipped rather than thrown so one malformed log cannot mask a
 * valid one later in the same digest.
 */
export function decodeProtocolVersionFromDigestLogs(logs: readonly string[]): number | undefined {
  for (const log of logs) {
    let b: Uint8Array;
    try { b = hexToBytes(log); } catch { continue; }
    // variant(1) + engine(4) + at least a 1-byte compact length
    if (b.length < 6 || b[0] !== 0x04) continue;
    if (!MNSV.every((c, i) => b[1 + i] === c)) continue;
    let len: { value: number; size: number };
    try { len = decodeCompact(b, 5); } catch { continue; }
    const start = 5 + len.size;
    if (len.value < 4 || start + len.value > b.length) continue;
    let v = 0;
    for (let i = 3; i >= 0; i--) v = v * 256 + b[start + i]!;
    return v;
  }
  return undefined;
}

/** Protocol-version ranges whose ledger codec this reader is wired for, mirroring the reference's
 *  own gate. Accepting an unknown version would decode a future ledger with today's deserializer —
 *  either garbage that still parses, or an opaque error blamed on the wrong thing. */
const SUPPORTED_PROTOCOL_RANGES: readonly (readonly [number, number])[] = [
  [22_000, 23_000],
  [1_000_000, 1_001_000],
];

export function isSupportedProtocolVersion(version: number): boolean {
  return SUPPORTED_PROTOCOL_RANGES.some(([lo, hi]) => version >= lo && version < hi);
}

/** Runtime call indices, per protocol-version range, and only where actually observed on a real
 *  node of that version. Fail-closed: an unmapped version stops ingest visibly rather than
 *  misclassifying silently. */
interface TimestampCallIndices { pallet: number; call: number }
function timestampIndicesFor(version: number): TimestampCallIndices | undefined {
  // node 1.0.x: Timestamp = pallet 1, call 0. Verified against a real block-45 inherent,
  // `0x280501000be07b93d89f01` -> 1786044972000, which equals the indexer's reported timestamp.
  if (version >= 1_000_000 && version < 1_001_000) return { pallet: 1, call: 0 };
  return undefined;
}

/**
 * Milliseconds since the Unix epoch from the block's own `Timestamp::set` inherent, or `undefined`
 * if the body carries none this reader can decode.
 *
 * Shape: compact body length | bare version byte | pallet | call | one `Compact<u64>` moment. The
 * single argument must span exactly to the end of the extrinsic — that is what rules out a
 * multi-argument call from another pallet that happens to begin with a plausible compact.
 */
export function decodeBlockTimestampMs(
  extrinsicHexes: readonly string[],
  protocolVersion: number,
): number | undefined {
  const idx = timestampIndicesFor(protocolVersion);
  if (idx === undefined) return undefined;
  for (const hex of extrinsicHexes) {
    let bytes: Uint8Array;
    let body: { value: number; size: number };
    try {
      bytes = hexToBytes(hex);
      body = decodeCompact(bytes, 0);
    } catch { continue; }
    if (body.size + body.value !== bytes.length || body.value < 4) continue;
    const version = bytes[body.size]!;
    if ((version & 0b1100_0000) !== 0) continue;            // inherents are bare, never signed
    const fmt = version & 0b0011_1111;
    if (fmt !== 4 && fmt !== 5) continue;
    if (bytes[body.size + 1] !== idx.pallet) continue;      // classify by CALL, not by shape
    if (bytes[body.size + 2] !== idx.call) continue;
    let moment: { value: number; size: number };
    try { moment = decodeCompact(bytes, body.size + 3); } catch { continue; }
    if (body.size + 3 + moment.size !== bytes.length) continue;
    return moment.value;
  }
  return undefined;
}

/** The archive stores header/body blobs as canonical JSON (see the module doc). */
export function parseHeaderBlob(blob: Uint8Array): { digestLogs: string[]; parentHash: string } {
  const header = JSON.parse(new TextDecoder().decode(blob)) as {
    digest?: { logs?: string[] };
    parentHash?: string;
  };
  return { digestLogs: header.digest?.logs ?? [], parentHash: header.parentHash ?? "" };
}

export function parseBodyBlob(blob: Uint8Array): string[] {
  const extrinsics = JSON.parse(new TextDecoder().decode(blob));
  return Array.isArray(extrinsics) ? (extrinsics as string[]) : [];
}
