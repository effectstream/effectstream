// Loose type shim for the @effectstream/wallets barrel. The package ships raw
// .ts (no .d.ts) using syntax the app's strict tsc rejects (const enum,
// parameter properties); tsc resolves this shim via tsconfig `paths`, while Vite
// (which ignores tsconfig paths) bundles the real module. Its chain deps are
// optional/lazy (dynamic import), so the barrel browser-bundles fine.

export interface WalletLoginSuccess {
  success: true;
  result: { provider: any; walletAddress: any; metadata: { name: string; displayName?: string; icon?: string } };
}
export interface WalletLoginFailure {
  success: false;
  errorMessage?: string;
  message?: string;
}
export function walletLogin(info: any): Promise<WalletLoginSuccess | WalletLoginFailure>;

export interface InjectedOption {
  metadata: { name: string; displayName?: string; icon?: string };
  api: () => Promise<any>;
}
export function allInjectedWallets(config?: {
  signatureSupport: boolean;
  transactionSupport: boolean;
}): Promise<Record<number, InjectedOption[]>>;
