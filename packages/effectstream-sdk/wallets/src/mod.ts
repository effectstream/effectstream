export type { IProvider, AddressAndType, UserSignature, WalletOption } from "./IProvider.ts";
export type { Wallet } from "./types.ts";
export type { AddressType, WalletAddress } from "@effectstream/utils";
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
export * from "./effectstream.ts";
