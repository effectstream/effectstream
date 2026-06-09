// Single source of truth for "who is the connected player" in this tab.
//
// Identity lives ONLY here (plus a per-tab sessionStorage mirror) — never in
// the URL, never in a hardcoded Hardhat-account table. Because sessionStorage
// is per-tab, two browser tabs hold two independent wallets, so a local
// 2-player match is just "open the lobby link in a second tab and connect a
// second wallet". This is what fixes the old "both tabs are the same player"
// collision.
//
// Two ways to connect (surfaced by connect_widget.ts):
//   • a REAL installed wallet   → connectInjected()        (MetaMask, Rabby, …)
//   • a random "browser" wallet  → connectBrowserWallet()   (generated + faucet-funded)
//
// The connected wallet is consumed by paima/middleware.ts (sendTransaction) and
// read by the game screens via mw.getUserWallet() → game.localWallet.
import {
  allInjectedWallets,
  walletLogin,
  WalletMode,
  type LoginInfo,
  type Wallet,
  type WalletOption,
} from '@effectstream/wallets';
import {hardhat as hardhatChain} from 'viem/chains';
import {generatePrivateKey} from 'viem/accounts';
import type {Hex} from 'viem';
import {fundAddress, hasBalance} from './faucet';

// The template's viem `Chain` and @effectstream/wallets' pinned viem `Chain`
// are structurally identical but nominally distinct; widen once so the login
// calls type-check (runtime is unaffected). Same trick paima/middleware.ts uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hardhat: any = hardhatChain;

const HARDHAT_RPC = 'http://localhost:8545';
const SESSION_KEY = 'hexWallet';

type Persisted =
  | {mode: 'injected'; name: string}
  | {mode: 'browser'; privateKey: Hex};

let current: Wallet | null = null;
let address: string | null = null; // always lowercase
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch (e) {
      console.error('[wallet] subscriber threw', e);
    }
  }
}

// Subscribe to connect/disconnect changes (returns an unsubscribe fn).
export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getWallet(): Wallet | null {
  return current;
}
export function getAddress(): string | null {
  return address;
}
export function isConnected(): boolean {
  return current != null;
}

function addressOf(w: Wallet): string {
  return (
    w.walletAddress ??
    w.provider.getAddress?.()?.address ??
    ''
  ).toLowerCase();
}

function persist(p: Persisted): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(p));
  } catch {
    /* sessionStorage unavailable */
  }
}

function setConnected(w: Wallet, p: Persisted): void {
  current = w;
  address = addressOf(w);
  persist(p);
  notify();
}

// Discover installed injected EVM wallets (metadata only) for the connect modal.
export async function listInjected(): Promise<WalletOption[]> {
  try {
    const all = await allInjectedWallets({
      signatureSupport: true,
      transactionSupport: true,
    });
    return (all[WalletMode.EvmInjected] ?? []).map(o => o.metadata);
  } catch (e) {
    console.warn('[wallet] discovery failed', e);
    return [];
  }
}

// Connect a real installed wallet. `name` is a WalletOption.name from
// listInjected(); when omitted, connects the first available.
export async function connectInjected(name?: string): Promise<Wallet> {
  const all = await allInjectedWallets({
    signatureSupport: true,
    transactionSupport: true,
  });
  const evm = all[WalletMode.EvmInjected] ?? [];
  if (evm.length === 0) {
    throw new Error(
      'No browser wallet detected — install MetaMask, or create a browser wallet.'
    );
  }
  const chosen = name ?? evm[0].metadata.name;
  const res = await walletLogin({
    mode: WalletMode.EvmInjected,
    preference: {name: chosen},
    preferBatchedMode: false,
    chain: hardhat,
  } as LoginInfo);
  if (!res.success) {
    throw new Error(
      (res as {errorMessage?: string}).errorMessage ?? 'Wallet login failed'
    );
  }
  setConnected(res.result, {mode: 'injected', name: chosen});
  return res.result;
}

// Create (or restore) a random local wallet and connect it. Auto-funded from
// the Hardhat faucet so it can pay gas for the game's self-sequenced txs.
// Pass `existingKey` to restore the same wallet (e.g. on reload).
export async function connectBrowserWallet(existingKey?: Hex): Promise<Wallet> {
  const privateKey = existingKey ?? generatePrivateKey();
  const res = await walletLogin({
    mode: WalletMode.EvmViem,
    privateKey,
    rpcUrl: HARDHAT_RPC,
    chain: hardhat,
    preferBatchedMode: false,
  } as LoginInfo);
  if (!res.success) {
    throw new Error(
      (res as {errorMessage?: string}).errorMessage ??
        'Browser wallet login failed'
    );
  }
  const addr = addressOf(res.result);
  // Fund BEFORE marking connected so the first createLobby has gas. Best-effort:
  // some harnesses (the frontend-only launch test) have no chain on :8545, so a
  // faucet failure must never block connecting.
  try {
    if (!(await hasBalance(addr))) await fundAddress(addr);
  } catch (e) {
    console.warn('[wallet] faucet funding failed (continuing):', e);
  }
  setConnected(res.result, {mode: 'browser', privateKey});
  return res.result;
}

// Reconnect this tab's wallet from sessionStorage. Called once on boot, before
// any screen reads identity. Browser-mode re-funds idempotently (hasBalance
// skip); injected-mode may re-prompt the extension.
export async function restoreFromSession(): Promise<Wallet | null> {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    /* unavailable */
  }
  if (!raw) return null;
  let p: Persisted;
  try {
    p = JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
  try {
    if (p.mode === 'browser') return await connectBrowserWallet(p.privateKey);
    return await connectInjected(p.name);
  } catch (e) {
    console.warn('[wallet] restore failed; clearing session:', e);
    disconnect();
    return null;
  }
}

export function disconnect(): void {
  current = null;
  address = null;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* unavailable */
  }
  notify();
}

// Deterministic dev wallet (Hardhat account #0) — for headless e2e only, via
// the window.hexBattle test namespace. NOT part of the user-facing connect flow
// (real users get a fresh random browser wallet). Keeps e2e.test.ts's
// fixed-address assertion (0xf39f…2266) valid.
const HARDHAT_0: Hex =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export async function connectDeterministicDevWallet(): Promise<Wallet> {
  return connectBrowserWallet(HARDHAT_0);
}
