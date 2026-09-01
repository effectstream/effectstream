// Wallet connection abstraction.
//   - injected (Lace etc.): discovered + connected via the browser's
//     `window.midnight` provider map (dapp-connector ConnectedAPI →
//     browserContract path).
//   - local JS wallet (undeployed only): @effectstream/wallets' MidnightLocal
//     connector in facade mode — exposes a WalletFacade + WalletResult (facade
//     path). We import only the `/midnight-local` subpath: the package barrel
//     drags every chain connector (incl. Cardano's @lucid-evolution) and does
//     not browser-bundle.
//
// useZSwapApp depends only on this module's interface.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { walletLogin, allInjectedWallets } from '@effectstream/wallets';
import { api } from '../services/api';

const NETWORK_ID = (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as string) || 'undeployed';
// @effectstream/wallets WalletMode is a numeric const enum (stable published
// order): Midnight = 3. We use the literal to avoid a cross-module const-enum
// import (disallowed under verbatimModuleSyntax / fragile at runtime).
const MODE_MIDNIGHT = 3;

export type WalletKind = 'injected' | 'local';

export interface WalletOptionMeta {
  name: string;
  displayName: string;
  icon?: string;
  uuid?: string; // injected provider key in window.midnight
}

export interface Connected {
  kind: WalletKind;
  name: string;
  provider: any;
  /** dapp-connector ConnectedAPI (injected only). */
  connectedApi: ConnectedAPI | null;
  /** MidnightLocalApi with .walletFacade / .walletResult (local only). */
  localApi: any | null;
}

export interface WalletState {
  /**
   * As the wallet reports it, NEVER normalized: bech32m from Lace, but the raw
   * hex coin public key from the local JS wallet. Faucet's `toAddr` and the
   * shielded-output builders consume these as-is — for a canonical
   * `mn_shield-addr_…` to show a user, run it through `formatShieldedAddress`
   * with `shieldedEncryptionPublicKey`.
   */
  shieldedAddress: string | null;
  /** The other half of the shielded address. Same encoding rule as above. */
  shieldedEncryptionPublicKey: string | null;
  unshieldedAddress: string | null;
  shieldedBalances: Record<string, string>;
  unshieldedBalances: Record<string, string>;
}

const stringify = (m: Record<string, bigint> | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [t, a] of Object.entries(m ?? {})) out[t] = String(a);
  return out;
};

/** Injected Midnight wallets currently available — discovered by the package. */
export async function discoverInjected(): Promise<WalletOptionMeta[]> {
  const all = await allInjectedWallets({ signatureSupport: true, transactionSupport: true });
  const opts = all[MODE_MIDNIGHT] ?? [];
  return opts.map((o) => ({ name: o.metadata.name, displayName: o.metadata.displayName ?? o.metadata.name, icon: o.metadata.icon }));
}

export async function connectInjected(name?: string): Promise<Connected> {
  const res = await walletLogin({ mode: MODE_MIDNIGHT, preference: name ? { name } : undefined, networkId: NETWORK_ID });
  if (!res.success) throw new Error(res.errorMessage ?? res.message ?? 'wallet connect failed');
  const provider = res.result.provider;
  const connectedApi = provider.getConnection().api as ConnectedAPI;
  const metaName = res.result.metadata?.name ?? name ?? 'midnight';
  return { kind: 'injected', name: metaName, provider, connectedApi, localApi: null };
}

/** The built-in JS wallet (facade mode). Undeployed only. */
export async function connectLocal(seed?: string): Promise<Connected> {
  // Subpath import — keeps the all-chains barrel (and Cardano's @lucid-evolution)
  // out of the browser bundle.
  const { MidnightLocalConnector } = await import('@effectstream/wallets/midnight-local');
  const cfg = await api.getMidnightConfig().catch(() => null as any);
  const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';
  const networkUrls = {
    indexer: cfg?.indexerUri ?? `http://${host}:8088/api/v3/graphql`,
    indexerWS: cfg?.indexerWsUri ?? `ws://${host}:8088/api/v3/graphql/ws`,
    node: cfg?.nodeUri ?? `http://${host}:9944`,
    proofServer: cfg?.proofServerUri ?? `http://${host}:6300`,
  };
  const provider = await MidnightLocalConnector.instance().connectFromSeed({
    seed,
    networkId: NETWORK_ID,
    networkUrls,
    syncMode: 'all',
  });
  const localApi = (provider as any).getConnection().api;
  return { kind: 'local', name: 'midnight-local', provider, connectedApi: null, localApi };
}

export async function readState(c: Connected): Promise<WalletState> {
  if (c.kind === 'injected' && c.connectedApi) {
    const a = c.connectedApi as any;
    const [sh, unsh, shB, unshB] = await Promise.all([
      a.getShieldedAddresses(),
      a.getUnshieldedAddress(),
      a.getShieldedBalances(),
      a.getUnshieldedBalances(),
    ]);
    return {
      shieldedAddress: sh.shieldedAddress ?? null,
      shieldedEncryptionPublicKey: sh.shieldedEncryptionPublicKey ?? null,
      unshieldedAddress: unsh.unshieldedAddress ?? null,
      shieldedBalances: stringify(shB),
      unshieldedBalances: stringify(unshB),
    };
  }
  // local facade
  const facade = c.localApi?.walletFacade as any;
  let shieldedBalances: Record<string, string> = {};
  let unshieldedBalances: Record<string, string> = {};
  try {
    const shState = await facade.shielded.waitForSyncedState();
    shieldedBalances = stringify(shState?.balances);
  } catch { /* still syncing */ }
  try {
    const unState = await facade.unshielded.waitForSyncedState();
    unshieldedBalances = stringify(unState?.balances);
  } catch { /* still syncing */ }
  return {
    shieldedAddress: c.localApi?.shieldedAddress ?? null,
    shieldedEncryptionPublicKey: c.localApi?.shieldedEncryptionPublicKey ?? null,
    unshieldedAddress: c.localApi?.unshieldedAddress ?? null,
    shieldedBalances,
    unshieldedBalances,
  };
}
