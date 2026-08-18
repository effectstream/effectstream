import { createHash } from "node:crypto";
import type { DefaultBatcherInput } from "./types.ts";

/**
 * Request identity — ONE serialization, used everywhere.
 *
 * The batcher already had this key three times over: `FileStorage` used it as
 * row identity, `DatabaseStorage` copied it, and `Batcher` built the same string
 * again to find the caller waiting on a receipt. Three copies of a key that must
 * agree byte-for-byte is a bug waiting for the fourth: a request whose storage
 * row and whose waiting caller disagree about what request it *is* cannot be
 * tracked, removed or reported on coherently.
 *
 * So the serialization lives here, and the request id is a hash of exactly that
 * string. Anything that can compute one can compute the other, and no site can
 * drift without every site drifting with it.
 */

/**
 * The content key: `addressType|target|address|timestamp|signature|input`.
 *
 * `target` is part of the identity on purpose — a byte-identical payload sent to
 * two products is two requests, and collapsing them would let one product's
 * batch remove or retry-charge the other's input (spec User Story 4).
 *
 * `fallbackTarget` is used only when the input does not carry its own. Rows
 * written today are always stamped with their resolved target; the fallback
 * exists for rows journaled before per-row targets were recorded, and for
 * callers that hand back the raw payload they were given.
 *
 * KNOWN LIMIT, inherited deliberately: fields are joined with `|` and not
 * escaped, so a field that itself contained a `|` could in principle be read as
 * two fields (`signature="a", input="b|c"` serialises the same as
 * `signature="a|b", input="c"`). It is kept because this exact string is
 * already the identity of every row in every live queue — changing it would
 * orphan them all — and it is not reachable: the fields that would have to
 * carry the `|` are a signature and an address, which are hex or base64, and a
 * timestamp. Only `input` is freely chosen, and it is the LAST field, where an
 * extra separator has nothing to shift into.
 */
export function buildRequestKey(
  input: DefaultBatcherInput,
  fallbackTarget: string,
): string {
  return [
    input.addressType,
    input.target ?? fallbackTarget,
    input.address,
    input.timestamp,
    input.signature ?? "",
    input.input,
  ].join("|");
}

/**
 * sha256 of a content key, hex-encoded — the `requestId` (spec FR-006).
 *
 * Separate from `buildRequestKey` so a caller that already holds the key (the
 * storage layer holds one per row) can hash it without rebuilding it.
 */
export function requestIdFromKey(contentKey: string): string {
  return createHash("sha256").update(contentKey, "utf8").digest("hex");
}

/** `requestIdFromKey(buildRequestKey(input, fallbackTarget))`. */
export function computeRequestId(
  input: DefaultBatcherInput,
  fallbackTarget: string,
): string {
  return requestIdFromKey(buildRequestKey(input, fallbackTarget));
}
