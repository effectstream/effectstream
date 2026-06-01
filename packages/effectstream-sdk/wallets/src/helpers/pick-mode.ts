import { WalletMode } from "../utils.ts";
import type { LoginInfo, LoginInfoMap } from "../wallet-modes.ts";

export type ChainKey = "evm" | "cardano" | "midnight";

type StripMode<T> = T extends { mode: WalletMode } ? Omit<T, "mode"> : T;

type LocalModeForChain<C extends ChainKey> = C extends "evm"
  ? WalletMode.EvmViem
  : C extends "cardano"
  ? WalletMode.CardanoLocal
  : C extends "midnight"
  ? WalletMode.MidnightLocal
  : never;

type InjectedModeForChain<C extends ChainKey> = C extends "evm"
  ? WalletMode.EvmInjected
  : C extends "cardano"
  ? WalletMode.Cardano
  : C extends "midnight"
  ? WalletMode.Midnight
  : never;

export type LocalOptionsForChain<C extends ChainKey> = StripMode<
  LoginInfoMap[LocalModeForChain<C>]
>;

export type InjectedOptionsForChain<C extends ChainKey> = StripMode<
  LoginInfoMap[InjectedModeForChain<C>]
>;

export type PickWalletModeArgs<C extends ChainKey> = {
  chain: C;
  /** True → return a local-wallet LoginInfo; false → injected. */
  preferLocal: boolean;
  /** Options for the local-wallet branch. Required because callers can't no-op a local wallet (it needs a seed/key). */
  localOptions: LocalOptionsForChain<C>;
  /** Options for the injected branch. Required so users always see the same wallet picker UX. */
  injectedOptions: InjectedOptionsForChain<C>;
};

/**
 * Pick between an injected (browser-extension) and a local (seed/key) wallet
 * based on `preferLocal`, and return a ready-to-pass `LoginInfo` for
 * `walletLogin()`. Both branches return the same `Wallet` shape from
 * `walletLogin`, so the rest of the app does not need to branch on mode.
 *
 * Typical use (Vite frontend, headless test, etc.):
 * ```ts
 * const wallet = await walletLogin(pickWalletMode({
 *   chain: "midnight",
 *   preferLocal: import.meta.env.VITE_WALLET_MODE === "local",
 *   localOptions: { seed, networkId },
 *   injectedOptions: { preference: { name: "lace" }, networkId },
 * }));
 * ```
 */
export function pickWalletMode<C extends ChainKey>(
  args: PickWalletModeArgs<C>,
): LoginInfo {
  if (args.preferLocal) {
    const mode = localModeFor(args.chain);
    return { mode, ...(args.localOptions as object) } as LoginInfo;
  }
  const mode = injectedModeFor(args.chain);
  return { mode, ...(args.injectedOptions as object) } as LoginInfo;
}

function localModeFor(chain: ChainKey): WalletMode {
  switch (chain) {
    case "evm":
      return WalletMode.EvmViem;
    case "cardano":
      return WalletMode.CardanoLocal;
    case "midnight":
      return WalletMode.MidnightLocal;
  }
}

function injectedModeFor(chain: ChainKey): WalletMode {
  switch (chain) {
    case "evm":
      return WalletMode.EvmInjected;
    case "cardano":
      return WalletMode.Cardano;
    case "midnight":
      return WalletMode.Midnight;
  }
}
