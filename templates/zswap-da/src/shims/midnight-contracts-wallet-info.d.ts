// Loose type shim for @effectstream/midnight-contracts' /wallet-info subpath.
//
// Same reason as the @effectstream/wallets shims: the package's exports point
// at raw .ts, so a direct import drags its sources into this app's strict
// typecheck (noUnusedLocals, erasableSyntaxOnly) and fails on the package's
// own lint debt rather than on anything here. tsc resolves this shim via
// tsconfig `paths`; Vite ignores paths and bundles the real module.
//
// Only the sliver localTradeOffers.ts needs is declared.

/** Shielded address as wallet-sdk-address-format models it — a real class
 *  instance (Symbol-branded), usable as an initSwap receiverAddress. */
export interface ShieldedAddressLike {
  coinPublicKeyString(): string;
  encryptionPublicKeyString(): string;
}

export interface InitialShieldedState {
  address: ShieldedAddressLike;
  [k: string]: unknown;
}

/** Reads the shielded wallet's initial synced state (address + balances). */
export declare function getInitialShieldedState(shielded: unknown): Promise<InitialShieldedState>;
