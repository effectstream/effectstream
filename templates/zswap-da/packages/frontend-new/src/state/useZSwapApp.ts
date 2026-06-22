// useZSwapApp — the central `st` adapter the screens consume, wired to the real
// integration. Wallet connect goes through @effectstream/wallets (src/state/
// wallet.ts): discovered injected wallets + a built-in JS wallet (undeployed).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WalletInfo } from '../ui/WalletPill';
import type { ToastItem } from '../ui/Toasts';
import {
  connectInjected,
  connectLocal,
  discoverInjected,
  readState,
  type Connected,
  type WalletOptionMeta,
  type WalletState,
} from './wallet';
import { useZSwapAPI } from '../hooks/useZSwapAPI';
import { useTokens } from '../hooks/useTokens';
import { useContract, type BrowserMintResult } from '../hooks/useContract';
import { useMintReconciler } from '../hooks/useMintReconciler';
import { type OfferLeg } from '../services/makerOffer';
import { makeInjectedTradeWallet, makeLocalTradeWalletStub, type TradeWallet } from './tradeWallet';
import { api } from '../services/api';
import { addMyOffer } from './myOffers';
import type { ConfirmPayload } from '../ui/ConfirmModal';
import { fmtAmt } from './format';
import { addTrade, clearTrades, listTrades, removeTrade, subscribeTrades, updateTradeStatus, type MyTrade } from './myTrades';
import { parseTakerLegs } from '../services/offerParse';
import { isOwnOffer, parseOfferSender, unshieldedAddressToHex } from '../services/offerSender';
import { isMyOffer } from './myOffers';
import { findTokenName, shortToken } from '../utils';
import type { KnownToken, ZSwapOffer } from '../types';

const NETWORK_ID = 'undeployed';

/** A single open swap offer, in the shape the order-book screen consumes. */
export interface Order {
  id: number;
  from: string;
  to: string;
  fromColor: string;
  toColor: string;
  amtFrom: number;
  amtTo: number;
  impliedRate: number;
  ttl: number | null;
  ttlMax: number | null;
  blob?: string;
  multiGive: boolean;
  multiWant: boolean;
}

/** Taker-perspective preview of an importable offer blob. */
export interface OfferPreview {
  pays: { sym: string; amt: number }[];
  gets: { sym: string; amt: number }[];
  shielded: boolean;
}

function toOrder(offer: ZSwapOffer, knownTokens: KnownToken[]): Order | null {
  const give = offer.gives?.[0] as any;
  const want = offer.wants?.[0] as any;
  if (!give || !want) return null;
  const fromColor = String(give.token ?? give.type ?? '');
  const toColor = String(want.token ?? want.type ?? '');
  const amtFrom = Number(give.amount);
  const amtTo = Number(want.amount);
  // offers carry no live TTL via the API today (metadata_expires_at is null),
  // so render them as "live" rather than a countdown.
  return {
    id: offer.id,
    from: findTokenName(fromColor, knownTokens) ?? shortToken(fromColor),
    to: findTokenName(toColor, knownTokens) ?? shortToken(toColor),
    fromColor,
    toColor,
    amtFrom,
    amtTo,
    impliedRate: amtFrom > 0 ? amtTo / amtFrom : 0,
    ttl: null,
    ttlMax: null,
    blob: offer.transaction_hex,
    multiGive: (offer.gives?.length ?? 0) > 1,
    multiWant: (offer.wants?.length ?? 0) > 1,
  };
}

const LOCAL_WALLET_NETWORK = 'Undeployed';

function brandStyle(name: string): { tint: string; glyph: string } {
  if (name === 'midnight-local') return { tint: '#0000FE', glyph: 'JS' };
  if (/lace/i.test(name)) return { tint: '#0A0A0A', glyph: '◧' };
  return { tint: '#5A6473', glyph: '◓' };
}

export interface ZSwapApp {
  // wallet
  wallet: WalletInfo | null;
  walletKind: 'injected' | 'local' | null;
  connected: Connected | null;
  connectedApi: any | null;
  localApi: any | null;
  status: 'disconnected' | 'connecting' | 'connected';
  shieldedAddress: string | null;
  unshieldedAddress: string | null;
  shieldedBalances: Record<string, string> | null;
  unshieldedBalances: Record<string, string> | null;
  refreshing: boolean;
  // discovery + connect
  injectedOptions: WalletOptionMeta[];
  connectInjectedWallet: (name?: string) => Promise<void>;
  connectLocalWallet: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  refreshBalances: () => void;
  // connect modal
  connectOpen: boolean;
  setConnectOpen: (v: boolean) => void;
  // toasts
  toasts: ToastItem[];
  toast: (msg: string, kind?: 'ok' | string) => void;
  // network
  network: string;
  setNetwork: (n: string) => void;
  localWalletAvailable: boolean;
  // order book (your own offers excluded)
  orders: Order[];
  ordersLoading: boolean;
  knownTokens: KnownToken[];
  refetchOffers: () => void;
  refetchTokens: () => void;
  selfUnshieldedHex: string | null;
  // faucet / mint — browser-wallet (ConnectedAPI) path only
  canMint: boolean;
  contractBusy: boolean;
  mintShielded: (domainSepBytes: Uint8Array, amount: bigint, nonce: bigint, name: string) => Promise<BrowserMintResult>;
  mintUnshielded: (domainSepBytes: Uint8Array, amount: bigint, name: string) => Promise<BrowserMintResult>;
  onMinted: () => void;
  // swap — create / take offers (browser-wallet ConnectedAPI path)
  canTrade: boolean;
  createOffer: (gives: OfferLeg[], wants: OfferLeg[]) => Promise<void>;
  takeOffer: (blob: string) => Promise<void>;
  // shared take-confirm dialog (driven by any screen, rendered once in App)
  pendingConfirm: ConfirmPayload | null;
  requestTake: (o: Order) => void;
  closeConfirm: () => void;
  // my trades — local, on-device log of created/taken offers
  myTrades: MyTrade[];
  clearTrade: (id: string) => void;
  clearAllTrades: () => void;
  importOffer: (blob: string) => Promise<void>;
  previewOffer: (blob: string) => OfferPreview | null;
}

export function useZSwapApp(): ZSwapApp {
  const [connected, setConnected] = useState<Connected | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [wstate, setWstate] = useState<WalletState | null>(null);
  const [injectedOptions, setInjectedOptions] = useState<WalletOptionMeta[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [network, setNetwork] = useState(LOCAL_WALLET_NETWORK);
  const zapi = useZSwapAPI();
  const { knownTokens, refetchTokens } = useTokens();
  const contract = useContract(connected?.connectedApi ?? null);
  const [mintTick, setMintTick] = useState(0);
  const [myTrades, setMyTrades] = useState<MyTrade[]>(() => listTrades());
  useEffect(() => subscribeTrades(() => setMyTrades([...listTrades()])), []);

  // The active wallet's transaction capability (mint/create/take). Injected
  // (Lace) is implemented; local (JS facade) is a portable stub. Every
  // transaction below routes through this seam.
  const tradeWallet = useMemo<TradeWallet | null>(() => {
    if (connected?.kind === 'injected' && connected.connectedApi) {
      return makeInjectedTradeWallet(connected.connectedApi, {
        mintShielded: contract.mintShielded,
        mintUnshielded: contract.mintUnshielded,
      });
    }
    if (connected?.kind === 'local') return makeLocalTradeWalletStub(connected.localApi);
    return null;
  }, [connected, contract.mintShielded, contract.mintUnshielded]);

  const requireWallet = useCallback((): TradeWallet => {
    if (!tradeWallet) throw new Error('Connect a wallet first.');
    if (!tradeWallet.canTransact) throw new Error(tradeWallet.unsupportedReason ?? 'This wallet cannot transact yet.');
    return tradeWallet;
  }, [tradeWallet]);

  const mintShielded = useCallback(
    (d: Uint8Array, a: bigint, n: bigint, name: string) => requireWallet().mintShielded(d, a, n, name),
    [requireWallet],
  );
  const mintUnshielded = useCallback(
    (d: Uint8Array, a: bigint, name: string) => requireWallet().mintUnshielded(d, a, name),
    [requireWallet],
  );

  // Poll the order book + token registry.
  const { fetchOffers } = zapi;
  useEffect(() => {
    refetchTokens();
    fetchOffers();
    const id = setInterval(() => {
      fetchOffers();
    }, 8000);
    return () => clearInterval(id);
  }, [fetchOffers, refetchTokens]);

  // Register freshly-minted token colors against queued names (backup path).
  useMintReconciler(connected?.connectedApi ?? null, knownTokens, mintTick, refetchTokens);

  const selfUnshieldedHex = useMemo(
    () => (wstate?.unshieldedAddress ? unshieldedAddressToHex(wstate.unshieldedAddress, NETWORK_ID as any) ?? null : null),
    [wstate?.unshieldedAddress],
  );

  // Map offers → order rows, EXCLUDING the connected wallet's own offers:
  // shielded offers are anonymous on-chain, so we use (a) a local record of
  // offers we created (isMyOffer) and (b) unshielded-owner match (isOwnOffer).
  const orders = useMemo<Order[]>(() => {
    return (zapi.offers ?? [])
      .filter((o) => {
        if (isMyOffer(o.transaction_hex)) return false;
        if (selfUnshieldedHex && o.transaction_hex) {
          const info = parseOfferSender(o.transaction_hex, NETWORK_ID as any);
          if (isOwnOffer(info, selfUnshieldedHex)) return false;
        }
        return true;
      })
      .map((o) => toOrder(o, knownTokens))
      .filter((o): o is Order => o !== null);
  }, [zapi.offers, knownTokens, selfUnshieldedHex]);

  const toast = useCallback((msg: string, kind?: 'ok' | string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // discover injected wallets (re-scanned when the connect modal opens)
  useEffect(() => {
    discoverInjected().then(setInjectedOptions).catch((e) => console.warn('[wallet] discover failed', e));
  }, []);

  const refreshState = useCallback(async (c: Connected) => {
    try {
      setWstate(await readState(c));
    } catch (e) {
      console.warn('[wallet] readState failed', e);
    }
  }, []);

  const finishConnect = useCallback(
    async (c: Connected) => {
      setConnected(c);
      setStatus('connected');
      setConnectOpen(false);
      toast('Wallet connected — shielded', 'ok');
      await refreshState(c);
    },
    [toast, refreshState],
  );

  const connectInjectedWallet = useCallback(
    async (name?: string) => {
      setStatus('connecting');
      try {
        await finishConnect(await connectInjected(name));
      } catch (e) {
        setStatus('disconnected');
        toast(`Connect failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [finishConnect, toast],
  );

  const connectLocalWallet = useCallback(async () => {
    setStatus('connecting');
    toast('Building local JS wallet…');
    try {
      await finishConnect(await connectLocal());
    } catch (e) {
      setStatus('disconnected');
      toast(`Local wallet failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [finishConnect, toast]);

  const connect = useCallback(() => {
    discoverInjected().then(setInjectedOptions).catch(() => {});
    setConnectOpen(true);
  }, []);

  const disconnect = useCallback(() => {
    setConnected(null);
    setStatus('disconnected');
    setWstate(null);
    toast('Wallet disconnected');
  }, [toast]);

  const refreshBalances = useCallback(async () => {
    if (!connected) return;
    setRefreshing(true);
    try {
      await refreshState(connected);
    } finally {
      setRefreshing(false);
    }
  }, [connected, refreshState]);

  // Called after a successful mint: refresh balances + token names, and bump
  // the reconciler trigger so any queued name registers against its new color.
  const onMinted = useCallback(() => {
    setMintTick((n) => n + 1);
    refetchTokens();
    refreshBalances();
  }, [refetchTokens, refreshBalances]);

  // Create a maker offer: build the imbalanced tx via the browser wallet,
  // encode + submit the blob, record it locally (so it's excluded from the
  // order book as "mine"), then refresh.
  const createOffer = useCallback(
    async (gives: OfferLeg[], wants: OfferLeg[]) => {
      const w = requireWallet();
      const cfg = contract.config ?? (await api.getMidnightConfig());
      const blob = await w.buildOfferBlob(cfg.networkId, gives, wants);
      await api.submitSwapOffer(blob);
      addMyOffer(blob);
      const give = gives[0];
      const want = wants[0];
      addTrade({
        kind: 'create',
        give: { sym: findTokenName(give.color, knownTokens) ?? shortToken(give.color), amt: Number(give.amount) },
        get: { sym: findTokenName(want.color, knownTokens) ?? shortToken(want.color), amt: Number(want.amount) },
        status: 'open',
        shielded: give.kind === 'shielded' && want.kind === 'shielded',
        blob,
      });
      toast('Offer created', 'ok');
      zapi.fetchOffers();
      refreshBalances();
    },
    [requireWallet, contract.config, knownTokens, toast, zapi, refreshBalances],
  );

  // Take an existing offer: reconstruct the maker tx from its blob, balance the
  // taker side via the browser wallet, and route to the batcher to settle.
  const takeOffer = useCallback(
    async (blob: string) => {
      const w = requireWallet();
      const cfg = contract.config ?? (await api.getMidnightConfig());
      await w.settleOffer(cfg, blob);
      toast('Offer taken — settling via batcher', 'ok');
      zapi.fetchOffers();
      refreshBalances();
    },
    [requireWallet, contract.config, toast, zapi, refreshBalances],
  );

  const [pendingConfirm, setPendingConfirm] = useState<ConfirmPayload | null>(null);
  const requestTake = useCallback(
    (o: Order) => {
      if (!o.blob) {
        toast('This offer has no settle blob — cannot take.');
        return;
      }
      const blob = o.blob;
      // Taker pays what the order WANTS (o.to / amtTo) and receives what it
      // GIVES (o.from / amtFrom).
      setPendingConfirm({
        title: 'Take offer',
        pay: { sym: o.to, amt: fmtAmt(o.amtTo) },
        receive: { sym: o.from, amt: fmtAmt(o.amtFrom) },
        cta: 'Take offer',
        onConfirm: async () => {
          await takeOffer(blob);
          addTrade({
            kind: 'take',
            give: { sym: o.to, amt: o.amtTo },
            get: { sym: o.from, amt: o.amtFrom },
            status: 'completed',
            shielded: false,
            blob,
          });
        },
      });
    },
    [toast, takeOffer],
  );
  const closeConfirm = useCallback(() => setPendingConfirm(null), []);

  // Taker-perspective preview of a pasted offer blob (names via known-tokens).
  const previewOffer = useCallback(
    (blob: string): OfferPreview | null => {
      const parsed = parseTakerLegs(blob.trim(), NETWORK_ID as any);
      if (!parsed) return null;
      const nm = (color: string) => findTokenName(color, knownTokens) ?? shortToken(color);
      const legs = [...parsed.pays, ...parsed.gets];
      return {
        pays: parsed.pays.map((l) => ({ sym: nm(l.color), amt: Number(l.amount) })),
        gets: parsed.gets.map((l) => ({ sym: nm(l.color), amt: Number(l.amount) })),
        shielded: legs.length > 0 && legs.every((l) => l.kind === 'shielded'),
      };
    },
    [knownTokens],
  );

  // Import a shared bech32m offer blob and take it; record it in the trade log
  // with a parsed give/receive when decodable.
  const importOffer = useCallback(
    async (blob: string) => {
      const b = blob.trim();
      const preview = previewOffer(b);
      await takeOffer(b);
      addTrade({
        kind: 'take',
        give: preview?.pays[0] ?? { sym: '—', amt: 0 },
        get: preview?.gets[0] ?? { sym: '—', amt: 0 },
        status: 'completed',
        shielded: preview?.shielded ?? false,
        blob: b,
      });
    },
    [previewOffer, takeOffer],
  );
  const clearTrade = useCallback((id: string) => removeTrade(id), []);
  const clearAllTrades = useCallback(() => clearTrades(), []);

  // Reconcile created-offer status: once a created offer has been observed live
  // in the book and later disappears (consumed or expired), mark it completed.
  const seenBlobs = useRef<Set<string>>(new Set());
  useEffect(() => {
    const offers = zapi.offers ?? [];
    const live = new Set(offers.map((o) => o.transaction_hex).filter(Boolean) as string[]);
    live.forEach((b) => seenBlobs.current.add(b));
    for (const t of listTrades()) {
      if (t.kind === 'create' && t.status === 'open' && t.blob && seenBlobs.current.has(t.blob) && !live.has(t.blob)) {
        updateTradeStatus(t.id, 'completed');
      }
    }
  }, [zapi.offers]);

  const wallet = useMemo<WalletInfo | null>(() => {
    if (!connected) return null;
    const { tint, glyph } = brandStyle(connected.name);
    return { id: connected.name, tint, glyph, name: connected.name };
  }, [connected]);

  return {
    wallet,
    walletKind: connected?.kind ?? null,
    connected,
    connectedApi: connected?.connectedApi ?? null,
    localApi: connected?.localApi ?? null,
    status,
    shieldedAddress: wstate?.shieldedAddress ?? null,
    unshieldedAddress: wstate?.unshieldedAddress ?? null,
    shieldedBalances: wstate?.shieldedBalances ?? null,
    unshieldedBalances: wstate?.unshieldedBalances ?? null,
    refreshing,
    injectedOptions,
    connectInjectedWallet,
    connectLocalWallet,
    connect,
    disconnect,
    refreshBalances,
    connectOpen,
    setConnectOpen,
    toasts,
    toast,
    network,
    setNetwork,
    localWalletAvailable: network === LOCAL_WALLET_NETWORK,
    orders,
    ordersLoading: zapi.loading,
    knownTokens,
    refetchOffers: zapi.fetchOffers,
    refetchTokens,
    selfUnshieldedHex,
    canMint: !!tradeWallet?.canTransact,
    contractBusy: contract.loading,
    mintShielded,
    mintUnshielded,
    onMinted,
    canTrade: !!tradeWallet?.canTransact,
    createOffer,
    takeOffer,
    pendingConfirm,
    requestTake,
    closeConfirm,
    myTrades,
    clearTrade,
    clearAllTrades,
    importOffer,
    previewOffer,
  };
}
