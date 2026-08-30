export * from "./evm/fetcher.ts";
export * from "./evm/state.ts";

export * from "./midnight/fetcher.ts";
export * from "./midnight/state.ts";
export * from "./midnight/tip.ts";
export { midnightStartPolicy } from "./midnight/start-policy.ts";

export * from "./avail/fetcher.ts";
export * from "./avail/state.ts";

export * from "./bitcoin/fetcher.ts";
export * from "./bitcoin/state.ts";

export * from "./ntp/fetcher.ts";
export * from "./ntp/state.ts";
export { getNtpTip, NtpTipError } from "./ntp/tip.ts";
export type { GetNtpTipOptions, NtpTip, NtpTipErrorCode } from "./ntp/tip.ts";
export { ntpStartPolicy } from "./ntp/start-policy.ts";

// Protocol-owned start policies. The generic runtime imports exactly the
// registry — never a per-chain hook (FR-004).
export {
  configuredStartIsLatest,
  numericStartPolicy,
  rejectLatest,
  START_BLOCK_HEIGHT_PROVENANCE,
  startPolicyRegistry,
} from "./start-policy.ts";
export type {
  ResolvedStart,
  StartPolicyProjection,
  StartPolicySnapshotFields,
  SyncProtocolStartPolicy,
} from "./start-policy.ts";

export * from "./utxorpc/fetcher.ts";
export * from "./utxorpc/state.ts";

export * from "./celestia/fetcher.ts";
export * from "./celestia/state.ts";

export * from "./test/fetcher.ts";
export * from "./test/state.ts";
export * from "./test/control.ts";

export type * from "./base/fetcher.ts";
export type * from "./base/state.ts";
export * from "./orchestration/merge.ts";
export * from "./orchestration/sync.ts";

export { chainPageRelation } from "./common/root.ts";
// TODO: remove
export type { ChainBlock } from "./common/root.ts";
