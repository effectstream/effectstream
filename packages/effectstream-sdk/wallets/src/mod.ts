export type { IProvider, AddressAndType, UserSignature, WalletOption } from "./IProvider.ts";
export type { Wallet } from "./types.ts";
export type { AddressType, WalletAddress } from "@effectstream/utils/types";
export { accountPayload_, accountMessages } from "@effectstream/concise";
export { WalletMode, WalletNameMap } from "./utils.ts";
// Main entry point
export { walletLogin } from "./wallets.ts";
export { allInjectedWallets } from "./utils.ts";
export { getAddressType } from "./wallet-modes.ts";
export type { LoginInfo, LoginInfoMap } from "./wallet-modes.ts";
// Local-wallet mode helper (env-driven injected↔local swap).
export { pickWalletMode } from "./helpers/pick-mode.ts";
export type {
  ChainKey,
  PickWalletModeArgs,
  LocalOptionsForChain,
  InjectedOptionsForChain,
} from "./helpers/pick-mode.ts";
// Inline data-URI icons for the three local-JS wallet modes (orange/blue/black
// JS circles), suitable for use as `WalletOption.icon`.
export {
  evmViemIcon,
  cardanoLocalIcon,
  midnightLocalIcon,
} from "./helpers/local-icons.ts";
// Coerces wallet/SDK rejects (including CIP-30-style `{code, info}` objects)
// to a readable string.
export { formatError } from "./helpers/format-error.ts";
export * from "./effectstream.ts";
