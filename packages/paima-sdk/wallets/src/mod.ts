export type { IProvider, AddressAndType, UserSignature, WalletOption } from "./IProvider.ts";
export type { Wallet } from "./types.ts";
export type { WalletAddress } from "@paima/utils";
export { WalletMode, WalletNameMap } from "./utils.ts";
// Main entry point
export { walletLogin } from "./wallets.ts";
export { allInjectedWallets } from "./utils.ts";
export * from "./paima.ts";