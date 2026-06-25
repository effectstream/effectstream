// @zswap-da/validator — shared, pure ZSwap offer validation.
//
// One deterministic routine used by the state-machine ingestion path and the
// batcher / submit fee-gate. No I/O of its own: callers supply `refState`,
// `tblock`, and (optionally) liveness checks. See validate.ts for the pipeline.
export { validateZswapOffer } from "./validate.ts";
export { getBlankRefState, buildStrictness } from "./refstate.ts";
export {
  bytesOrStringToHex,
  collectNullifiers,
  collectUnshieldedSpends,
  deriveLegs,
  UnknownTokenTagError,
} from "./derive.ts";
export {
  canonicalRootHex,
  extractInputRoot,
  extractOfferInputRoots,
  RootExtractError,
} from "./extract-root.ts";
export type {
  OfferRejectCode,
  OfferValidation,
  OfferLeg,
  UnshieldedSpendRef,
  ValidateOpts,
} from "./types.ts";
