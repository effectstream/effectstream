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
import { makeInjectedTradeWallet, makeLocalTradeWallet, type TradeWallet } from './tradeWallet';
import { injectedContractWallet, localContractWallet, type ContractWallet } from '../services/contractWallet';
import { api } from '../services/api';
import { addMyOffer } from './myOffers';
import type { ConfirmPayload } from '../ui/ConfirmModal';
import { fmtAmt } from './format';
import { addTrade, clearTrades, listTrades, removeTrade, subscribeTrades, updateTradeStatus, type MyTrade } from './myTrades';
import { parseTakerLegs } from '../services/offerParse';
import { isOwnOffer, parseOfferSender, unshieldedAddressToHex } from '../services/offerSender';
import { isMyOffer } from './myOffers';
import { findTokenName, shortToken } from '../utils';
import { log } from '../lib/log';
import { dlog, timed } from '../debug';
import { takerShortfalls, shortfallsFromLegs, shortfallMessage, batchTakerShortfalls, affordableIndices } from '../services/takerBalance';
import type { KnownToken, OfferStatus, ZSwapOffer } from '../types';

const NETWORK_ID = (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as string) || 'undeployed';

/** A single live swap offer, in the shape the order-book screen consumes. */
export interface Order {
  from: string;
  to: string;
  fromColor: string;
  toColor: string;
  amtFrom: number;
  amtTo: number;
  impliedRate: number;
  /** Conservative floor on expiry — shielded offers can outlive it. Display as
   *  "expires ≥ …"; `status` is the authoritative end state. */
  expiresAt: string | null;
  ttl: number | null;
  ttlMax: number | null;
  /** Content hash of the raw transaction bytes — the stable cross-node
   *  identity, safe as a React key. `null` only if the node couldn't hash it. */
  offerId: string | null;
  /** Blob length reported by the list, for display only. The blob itself is
   *  fetched on selection via `GET /v1/offers/:offerId` — the order book is
   *  blob-free, so `blob` is only set once loadOfferBlob() has run. */
  blobChars?: number;
  blob?: string;
  status: OfferStatus;
  multiGive: boolean;
  multiWant: boolean;
  /** true when this offer was created by the connected wallet (shown in the
   *  listings as liquidity, but not takeable — you can't take your own offer). */
  isMine: boolean;
}

/** Taker-perspective preview of an importable offer blob. */
export interface OfferPreview {
  pays: { sym: string; amt: number }[];
  gets: { sym: string; amt: number }[];
  shielded: boolean;
}

function toOrder(offer: ZSwapOffer, knownTokens: KnownToken[]): Order | null {
  // Legs live under `computed` — they are derived by the indexer from the
  // transaction itself, not supplied by the maker.
  const give = offer.computed?.gives?.[0];
  const want = offer.computed?.wants?.[0];
  if (!give || !want) return null;
  const fromColor = String(give.token ?? '');
  const toColor = String(want.token ?? '');
  // NOTE: amounts are decimal strings (u128 on-chain). Number() is lossy above
  // 2^53 and is used here only for display and for the book's price ordering,
  // which the existing UI has always done in floats. Anything exact (balance
  // checks, settlement) works from the blob's own legs, not these.
  const amtFrom = Number(give.amount);
  const amtTo = Number(want.amount);
  return {
    from: findTokenName(fromColor, knownTokens) ?? shortToken(fromColor),
    to: findTokenName(toColor, knownTokens) ?? shortToken(toColor),
    fromColor,
    toColor,
    amtFrom,
    amtTo,
    impliedRate: amtFrom > 0 ? amtTo / amtFrom : 0,
    // `expiresAt` is a conservative FLOOR — a shielded offer can stay fillable
    // past it. Surfaced for display only; the status field is the authority.
    expiresAt: offer.computed?.expiresAt ?? null,
    ttl: null,
    ttlMax: null,
    offerId: offer.offerId ?? null,
    blobChars: offer.blobChars,
    status: offer.computed?.status ?? 'live',
    multiGive: (offer.computed?.gives?.length ?? 0) > 1,
    multiWant: (offer.computed?.wants?.length ?? 0) > 1,
    isMine: false,
  };
}

const LOCAL_WALLET_NETWORK = 'Undeployed';

// Derive the display network name from the env var (e.g. 'preview' → 'Preview').
// Falls back to 'Undeployed' when no network is configured.
const DISPLAY_NETWORK =
  NETWORK_ID === 'undeployed'
    ? LOCAL_WALLET_NETWORK
    : NETWORK_ID.charAt(0).toUpperCase() + NETWORK_ID.slice(1);

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
  /** Other half of the shielded address — display-side only (WalletMenu). */
  shieldedEncryptionPublicKey: string | null;
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
  /** True while the book has further keyset pages to fetch. */
  hasMoreOrders: boolean;
  /** Append the next page. Explicit click-to-load — the book does not
   *  auto-paginate, so a deep book never silently fans out into many requests. */
  loadMoreOrders: () => void;
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
  createOffer: (gives: OfferLeg[], wants: OfferLeg[], opts?: { onStatus?: (s: string) => void }) => Promise<void>;
  takeOffer: (blob: string) => Promise<void>;
  // shared take-confirm dialog (driven by any screen, rendered once in App)
  pendingConfirm: ConfirmPayload | null;
  /** Async: the offer's blob is fetched on selection (the book is blob-free). */
  requestTake: (o: Order) => Promise<void>;
  requestTakeMany: (orders: Order[]) => Promise<void>;
  /** True while blobs are being fetched for a selection, before the confirm
   *  dialog opens. Used to disable take controls so the round trip isn't
   *  silent. */
  takePreparing: boolean;
  /** Reason an offer blob can't be taken with the current balances, else null. */
  takerShortfall: (blob: string) => string | null;
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
  const [network, setNetwork] = useState(DISPLAY_NETWORK);
  const zapi = useZSwapAPI();
  const { knownTokens, refetchTokens } = useTokens();
  // Contract (mint) wallet adapter — BOTH wallets can drive the contract: Lace
  // through the dapp-connector, the built-in JS wallet through the facade.
  const contractWallet = useMemo<ContractWallet | null>(() => {
    if (connected?.kind === 'injected' && connected.connectedApi) {
      return injectedContractWallet(connected.connectedApi);
    }
    if (connected?.kind === 'local' && connected.localApi) {
      return localContractWallet(connected.localApi);
    }
    return null;
  }, [connected]);
  const contract = useContract(contractWallet);
  const [mintTick, setMintTick] = useState(0);
  const [myTrades, setMyTrades] = useState<MyTrade[]>(() => listTrades());
  useEffect(() => subscribeTrades(() => setMyTrades([...listTrades()])), []);

  // The active wallet's transaction capability (mint/create/take). Injected
  // (Lace) goes through the dapp-connector; local (JS facade) through the
  // wallet facade's own APIs. Every transaction below routes through this seam.
  const tradeWallet = useMemo<TradeWallet | null>(() => {
    if (connected?.kind === 'injected' && connected.connectedApi) {
      return makeInjectedTradeWallet(connected.connectedApi, {
        mintShielded: contract.mintShielded,
        mintUnshielded: contract.mintUnshielded,
      });
    }
    if (connected?.kind === 'local' && connected.localApi) {
      return makeLocalTradeWallet(connected.localApi, {
        mintShielded: contract.mintShielded,
        mintUnshielded: contract.mintUnshielded,
      });
    }
    return null;
  }, [connected, contract.mintShielded, contract.mintUnshielded]);

  const requireWallet = useCallback((): TradeWallet => {
    if (!tradeWallet) throw new Error('Connect a wallet first.');
    if (!tradeWallet.canTrade) throw new Error(tradeWallet.unsupportedReason ?? 'This wallet cannot trade yet.');
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
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchOffers, refetchTokens]);

  // Register freshly-minted token colors against queued names (backup path).
  useMintReconciler(connected?.connectedApi ?? null, knownTokens, mintTick, refetchTokens);

  const selfUnshieldedHex = useMemo(
    () => (wstate?.unshieldedAddress ? unshieldedAddressToHex(wstate.unshieldedAddress, NETWORK_ID as any) ?? null : null),
    [wstate?.unshieldedAddress],
  );

  // Blobs fetched on demand from GET /v1/offers/:offerId, keyed by offerId.
  // The order book is blob-free, so this fills in only for offers the user has
  // actually selected — never prefetched for a whole page.
  const [blobById, setBlobById] = useState<Record<string, string>>({});

  /**
   * Resolve one offer's blob, from cache or the API. Returns null when the row
   * carries no offerId, or the offer is gone (404 NOT_FOUND — it was consumed
   * between the page render and the click).
   */
  const loadOfferBlob = useCallback(
    async (offerId: string | null): Promise<string | null> => {
      if (!offerId) return null;
      const cached = blobById[offerId];
      if (cached) return cached;
      try {
        const detail = await timed(`loadOfferBlob: GET /v1/offers/${offerId.slice(0, 12)}…`, () =>
          api.getOfferById(offerId),
        );
        setBlobById((m) => (m[offerId] ? m : { ...m, [offerId]: detail.offerBech32 }));
        return detail.offerBech32;
      } catch (e: any) {
        dlog('loadOfferBlob: failed', { offerId, code: e?.code, message: e?.message });
        return null;
      }
    },
    [blobById],
  );

  // Map offers → order rows. We KEEP the connected wallet's own offers (they are
  // real open liquidity and affect the market — hiding them makes it look like
  // your orders don't exist), but flag them `isMine` so the UI can mark them and
  // keep them non-takeable.
  //
  // Ownership: shielded offers are anonymous on-chain, so the primary signal is
  // a local record of what this browser created — now keyed by offerId, which
  // is what the blob-free list carries. The unshielded-sender match needs the
  // blob, so it can only run for offers whose blob we've already fetched; the
  // authoritative check happens at selection time in requestTake(), where the
  // blob is always loaded.
  const orders = useMemo<Order[]>(() => {
    return (zapi.offers ?? [])
      .map((o): Order | null => {
        const order = toOrder(o, knownTokens);
        if (!order) return null;
        const blob = order.offerId ? blobById[order.offerId] : undefined;
        let mine = isMyOffer(order.offerId) || isMyOffer(blob);
        if (!mine && selfUnshieldedHex && blob) {
          mine = isOwnOffer(parseOfferSender(blob, NETWORK_ID as any), selfUnshieldedHex);
        }
        return { ...order, blob, isMine: mine };
      })
      .filter((o): o is Order => o !== null);
  }, [zapi.offers, knownTokens, selfUnshieldedHex, blobById]);

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
      const s = await readState(c);
      setWstate(s);
      log.info('[wallet] state read', {
        kind: c.kind,
        name: c.name,
        shieldedAddress: s.shieldedAddress,
        unshieldedAddress: s.unshieldedAddress,
        shieldedBalances: s.shieldedBalances,
        unshieldedBalances: s.unshieldedBalances,
      });
    } catch (e) {
      log.error('[wallet] readState failed', e);
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
    async (gives: OfferLeg[], wants: OfferLeg[], opts?: { onStatus?: (s: string) => void }) => {
      const w = requireWallet();

      // Balance guard (authoritative). The maker's `gives` legs become inputs
      // the wallet must supply when building the offer tx — offering to pay
      // tokens you don't hold makes the wallet's makeIntent hang/fail. Check
      // against FRESH balances (readState, not the wstate closure).
      if (connected) {
        const fresh = await readState(connected);
        const short = shortfallsFromLegs(
          gives,
          fresh.shieldedBalances,
          fresh.unshieldedBalances,
          knownTokens,
        );
        if (short.length > 0) {
          dlog('createOffer: BLOCKED — insufficient balance', {
            shortfalls: short.map((s) => ({ ...s, need: s.need.toString(), have: s.have.toString() })),
          });
          throw new Error(shortfallMessage(short)!);
        }
      }

      const cfg = contract.config ?? (await api.getMidnightConfig());
      opts?.onStatus?.('Building offer in wallet…');
      const blob = await w.buildOfferBlob(cfg.networkId, gives, wants);
      opts?.onStatus?.('Posting to Celestia…');

      // 409 DUPLICATE_OFFER / DUPLICATE_MARKERS isn't a failure from the
      // user's point of view — the offer already exists — so adopt the existing
      // offer's id and status. The node rejects it before paying a Celestia fee.
      //
      // Everything in TERMINAL_SUBMIT_CODES is unretryable by construction, so
      // there is no retry loop here any more. ROOT_UNKNOWN in particular used to
      // be polled up to 24 times as if it were transient; the node now diagnoses
      // it as a wallet/indexer misconfiguration and returns a `hint` naming the
      // exact fix, which we surface verbatim rather than burying under retries.
      let offerId: string | null = null;
      let duplicateStatus: OfferStatus | null = null;
      try {
        const submitted = await api.submitSwapOffer(blob);
        offerId = submitted?.offerId ?? null;
      } catch (e: any) {
        if (e?.code === 'DUPLICATE_OFFER' || e?.code === 'DUPLICATE_MARKERS') {
          offerId = e.data?.activeOfferId ?? e.data?.offerId ?? null;
          duplicateStatus = (e.data?.status as OfferStatus) ?? null;
          dlog('createOffer: duplicate offer', { code: e.code, offerId, status: duplicateStatus });
        } else if (e?.code === 'ROOT_UNKNOWN' && e.data?.hint) {
          dlog('createOffer: root unknown', e.data?.diagnostics);
          throw new Error(e.data.hint);
        } else {
          throw e;
        }
      }

      addMyOffer(offerId ?? blob);
      const give = gives[0];
      const want = wants[0];
      addTrade({
        kind: 'create',
        give: { sym: findTokenName(give.color, knownTokens) ?? shortToken(give.color), amt: Number(give.amount) },
        get: { sym: findTokenName(want.color, knownTokens) ?? shortToken(want.color), amt: Number(want.amount) },
        // A duplicate is already indexed, so skip 'not_public' and take the
        // server's word for where it is in its lifecycle.
        status: duplicateStatus ?? 'not_public',
        shielded: give.kind === 'shielded' && want.kind === 'shielded',
        blob,
        offerId: offerId ?? undefined,
      });
      toast(
        duplicateStatus
          ? `This offer was already posted (${duplicateStatus})`
          : `This intent was already active (${offerId ?? 'existing offer'})`,
        duplicateStatus ? undefined : 'ok',
      );
      zapi.fetchOffers();
      refreshBalances();
    },
    [requireWallet, connected, contract.config, knownTokens, toast, zapi, refreshBalances],
  );

  // Take an existing offer: reconstruct the maker tx from its blob, balance the
  // taker side via the browser wallet, and route to the batcher to settle.
  const takeOffer = useCallback(
    async (blob: string) => {
      dlog('takeOffer: enter', { blobLen: blob.length, blobHead: blob.slice(0, 24) });
      const w = requireWallet();
      dlog('takeOffer: wallet', { kind: w.kind, canTrade: w.canTrade });

      // Authoritative balance guard: every take path funnels here, so block once
      // on fresh balances (a missing input coin makes Lace's makeIntent hang).
      if (connected) {
        const fresh = await timed('takeOffer: readState (fresh balances)', () =>
          readState(connected),
        );
        const short = takerShortfalls(
          blob,
          fresh.shieldedBalances,
          fresh.unshieldedBalances,
          NETWORK_ID as any,
          knownTokens,
        );
        if (short.length > 0) {
          const msg = shortfallMessage(short)!;
          dlog('takeOffer: BLOCKED — insufficient balance', {
            shortfalls: short.map((s) => ({ ...s, need: s.need.toString(), have: s.have.toString() })),
          });
          throw new Error(msg);
        }
        dlog('takeOffer: balance check passed');
      }

      const cfg = contract.config
        ? (dlog('takeOffer: using cached midnight config', contract.config), contract.config)
        : await timed('takeOffer: GET /v1/midnight/config', () => api.getMidnightConfig());
      dlog('takeOffer: config resolved', {
        contractAddress: cfg.contractAddress,
        indexerUri: cfg.indexerUri,
        proofServerUri: cfg.proofServerUri,
        networkId: cfg.networkId,
      });
      const res = await timed('takeOffer: settleOffer (wallet balance + batcher submit)', () =>
        w.settleOffer(cfg, blob),
      );
      dlog('takeOffer: settleOffer returned', res);
      toast('Offer taken — settling via batcher', 'ok');
      dlog('takeOffer: refreshing offers + balances');
      zapi.fetchOffers();
      refreshBalances();
      dlog('takeOffer: exit');
    },
    [requireWallet, connected, knownTokens, contract.config, toast, zapi, refreshBalances],
  );

  // Proactive (pre-settle) balance check for an offer blob against the CURRENT
  // wallet balances.
  const takerShortfall = useCallback(
    (blob: string): string | null =>
      shortfallMessage(
        takerShortfalls(
          blob,
          wstate?.shieldedBalances,
          wstate?.unshieldedBalances,
          NETWORK_ID as any,
          knownTokens,
        ),
      ),
    [wstate, knownTokens],
  );

  const [pendingConfirm, setPendingConfirm] = useState<ConfirmPayload | null>(null);
  // Selecting an offer now costs a GET /v1/offers/:offerId per offer. Expose that
  // as a pending flag so the screens can disable their take controls instead of
  // appearing frozen between click and confirm dialog.
  const [takePreparing, setTakePreparing] = useState(false);
  const requestTake = useCallback(
    async (o: Order) => {
      if (!o.offerId) {
        // Legacy row indexed before content addressing — the node can't serve
        // its blob by hash, so there's nothing to settle from.
        toast('This offer predates content addressing and can no longer be taken.');
        return;
      }
      // Selection is where the blob gets fetched — the order book itself is
      // blob-free, so nothing was prefetched for the rest of the page.
      setTakePreparing(true);
      let blob: string | null;
      try {
        blob = await loadOfferBlob(o.offerId);
      } finally {
        setTakePreparing(false);
      }
      if (!blob) {
        toast('This offer is no longer available — it may have just been taken.');
        zapi.fetchOffers();
        return;
      }
      // The list can't tell whether an unshielded offer is ours (that needs the
      // blob). Now that we have it, check before letting the user take it.
      if (selfUnshieldedHex && isOwnOffer(parseOfferSender(blob, NETWORK_ID as any), selfUnshieldedHex)) {
        toast("That's your own offer — you can't take it.");
        return;
      }
      // Taker pays what the order WANTS (o.to / amtTo) and receives what it
      // GIVES (o.from / amtFrom).
      setPendingConfirm({
        title: 'Take offer',
        pay: { sym: o.to, amt: fmtAmt(o.amtTo) },
        receive: { sym: o.from, amt: fmtAmt(o.amtFrom) },
        cta: 'Take offer',
        blocked: takerShortfall(blob) ?? undefined,
        onConfirm: async () => {
          await takeOffer(blob);
          addTrade({
            kind: 'take',
            give: { sym: o.to, amt: o.amtTo },
            get: { sym: o.from, amt: o.amtFrom },
            status: 'consumed',
            shielded: false,
            blob,
            offerId: o.offerId ?? undefined,
          });
        },
      });
    },
    [toast, takeOffer, takerShortfall, loadOfferBlob, selfUnshieldedHex, zapi],
  );

  // Take one or more order-book offers in a single confirm dialog. Filters out
  // your own offers (you can't take them) and blobs we can't settle; aggregates
  // the pay/receive across the selection; settles each via the batcher in turn.
  const requestTakeMany = useCallback(
    async (orders: Order[]) => {
      if (!tradeWallet?.canTrade) {
        toast('Use the browser wallet (Lace) to take offers.');
        return;
      }
      const candidates = orders.filter((o) => !o.isMine && o.offerId);
      if (candidates.length === 0) {
        if (orders.some((o) => o.isMine)) {
          setConnectOpen(true);
          return;
        }
        toast(
          orders.some((o) => !o.offerId)
            ? 'These offers predate content addressing and can no longer be taken.'
            : 'No live offer to take here.',
        );
        return;
      }

      // Fetch the blobs for the SELECTION only — bounded by what the user
      // picked, never the whole book. Offers that 404 here were consumed
      // between render and click.
      setTakePreparing(true);
      let resolved: { o: Order; blob: string | null }[];
      try {
        resolved = await Promise.all(
          candidates.map(async (o) => ({ o, blob: await loadOfferBlob(o.offerId) })),
        );
      } finally {
        setTakePreparing(false);
      }
      // Only real bech32m offers (swapoffer1…) can be settled. Seeded demo
      // liquidity carries a placeholder blob and must be skipped with a clear
      // message rather than a cryptic decode error.
      const isReal = (b: string | null) => !!b && /^swapoffer1/i.test(b);
      const takeable = resolved
        .filter((r): r is { o: Order; blob: string } => isReal(r.blob))
        // The list can't detect unshielded ownership without the blob; now that
        // we have it, drop anything that turns out to be ours.
        .filter(({ blob }) =>
          !selfUnshieldedHex || !isOwnOffer(parseOfferSender(blob, NETWORK_ID as any), selfUnshieldedHex))
        .map(({ o, blob }) => ({ ...o, blob }));

      if (takeable.length === 0) {
        const vanished = resolved.some((r) => r.blob === null);
        toast(
          vanished
            ? 'Those offers are no longer available — they may have just been taken.'
            : resolved.some((r) => r.blob && !isReal(r.blob))
              ? "Seeded demo liquidity — these offers aren't settle-able. Use a real (swapoffer1…) offer to test taking."
              : 'No live offer to take here.',
        );
        if (vanished) zapi.fetchOffers();
        return;
      }
      const n = takeable.length;
      const payAmt = takeable.reduce((s, o) => s + o.amtTo, 0);
      const recvAmt = takeable.reduce((s, o) => s + o.amtFrom, 0);
      // Settle each selected offer via the batcher, in book order.
      const settle = (orders: (Order & { blob: string })[]) => async () => {
        for (const o of orders) {
          await takeOffer(o.blob);
          addTrade({
            kind: 'take',
            give: { sym: o.to, amt: o.amtTo },
            get: { sym: o.from, amt: o.amtFrom },
            status: 'consumed',
            shielded: false,
            blob: o.blob,
            offerId: o.offerId ?? undefined,
          });
        }
      };
      // Block on the AGGREGATE cost — checking each offer against the full
      // balance would pass a batch that only overspends in sum. When the whole
      // batch is short, compute the affordable prefix (best-priced first) so the
      // user can take part instead of nothing.
      const blocked = shortfallMessage(
        batchTakerShortfalls(
          takeable.map((o) => o.blob),
          wstate?.shieldedBalances,
          wstate?.unshieldedBalances,
          NETWORK_ID as any,
          knownTokens,
        ),
      ) ?? undefined;
      const okIdx = blocked
        ? new Set(
            affordableIndices(
              takeable.map((o) => parseTakerLegs(o.blob, NETWORK_ID as any)?.pays ?? []),
              wstate?.shieldedBalances,
              wstate?.unshieldedBalances,
            ),
          )
        : null;
      const affordable = okIdx ? takeable.filter((_, i) => okIdx.has(i)) : takeable;
      setPendingConfirm({
        title: n > 1 ? `Take ${n} offers` : 'Take offer',
        pay: { sym: takeable[0].to, amt: fmtAmt(payAmt) },
        receive: { sym: takeable[0].from, amt: fmtAmt(recvAmt) },
        cta: n > 1 ? `Take ${n} offers` : 'Take offer',
        blocked,
        items: n > 1
          ? takeable.map((o, i) => ({
              pay: `${fmtAmt(o.amtTo)} ${o.to}`,
              receive: `${fmtAmt(o.amtFrom)} ${o.from}`,
              ok: okIdx ? okIdx.has(i) : true,
            }))
          : undefined,
        partial: blocked && affordable.length > 0
          ? { cta: `Take affordable ${affordable.length} of ${n}`, onConfirm: settle(affordable) }
          : undefined,
        onConfirm: settle(takeable),
      });
    },
    [toast, takeOffer, tradeWallet, wstate, knownTokens, loadOfferBlob, selfUnshieldedHex, zapi],
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
        status: 'consumed',
        shielded: preview?.shielded ?? false,
        blob: b,
      });
    },
    [previewOffer, takeOffer],
  );
  const clearTrade = useCallback((id: string) => removeTrade(id), []);
  const clearAllTrades = useCallback(() => clearTrades(), []);

  // Live order-book reconciliation, keyed on offerId.
  //
  //   not_public → live   as soon as the id shows up in the book
  //   live       → ?      when a previously-seen id drops out
  //
  // Disappearing is NOT evidence of a fill. It could be a fill (consumed), the
  // maker spending the inputs elsewhere (cancelled), a TTL lapse (expired), or
  // simply the offer being pushed past the first page as the book grows. The
  // old code assumed "gone == completed" and so mislabelled cancels as fills;
  // now that archived offers resolve by id, ask instead of guessing.
  const seenIds = useRef<Set<string>>(new Set());
  const probing = useRef<Set<string>>(new Set());
  useEffect(() => {
    const offers = zapi.offers ?? [];
    const live = new Set(offers.map((o) => o.offerId).filter(Boolean) as string[]);
    for (const t of listTrades()) {
      if (t.kind !== 'create' || !t.offerId) continue;
      const id = t.offerId;
      if (live.has(id)) {
        seenIds.current.add(id);
        if (t.status === 'not_public') updateTradeStatus(t.id, 'live');
        continue;
      }
      if (t.status !== 'live' || !seenIds.current.has(id) || probing.current.has(id)) continue;
      probing.current.add(id);
      api
        .getOfferStatusById(id)
        .then((srv) => {
          // not_found here would mean the node forgot an offer it had indexed;
          // leave the local record alone rather than inventing a terminal state.
          if (srv === 'consumed' || srv === 'cancelled' || srv === 'expired') {
            updateTradeStatus(t.id, srv);
            seenIds.current.delete(id);
          }
        })
        .catch(() => { /* transient; retried on the next poll */ })
        .finally(() => probing.current.delete(id));
    }
  }, [zapi.offers]);

  // Startup-only reconciliation: on first mount, ask the server for the
  // definitive status of every non-terminal created trade.
  //
  // Trades carrying an offerId use the cheap per-id probe. Older records only
  // stored the blob, so those go through the batched POST — a blob is 16-25 KB,
  // far past any query-string limit.
  useEffect(() => {
    const pending = listTrades().filter(
      (t) => t.kind === 'create' && t.status !== 'cancelled' && (t.offerId || t.blob),
    );
    if (pending.length === 0) return;

    const apply = (t: MyTrade, srv: string | undefined) => {
      if (!srv || srv === 'unknown' || srv === 'not_found') return;
      // Terminal states are authoritative; 'live' only ever promotes a record
      // that was still waiting on the Celestia round-trip.
      if (srv === 'consumed' || srv === 'cancelled' || srv === 'expired') {
        if (t.status !== srv) updateTradeStatus(t.id, srv);
      } else if (srv === 'live' && t.status === 'not_public') {
        updateTradeStatus(t.id, 'live');
      }
    };

    const byId = pending.filter((t) => t.offerId);
    const byBlob = pending.filter((t) => !t.offerId && t.blob);

    Promise.all([
      Promise.all(
        byId.map(async (t) => apply(t, await api.getOfferStatusById(t.offerId!))),
      ),
      byBlob.length > 0
        ? api.fetchTradeStatuses(byBlob.map((t) => t.blob!)).then((statusMap) => {
            for (const t of byBlob) apply(t, statusMap[t.blob!]);
          })
        : Promise.resolve(),
    ]).catch(() => { /* startup reconcile is best-effort */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    shieldedEncryptionPublicKey: wstate?.shieldedEncryptionPublicKey ?? null,
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
    hasMoreOrders: zapi.hasMore,
    loadMoreOrders: zapi.loadMore,
    knownTokens,
    refetchOffers: zapi.fetchOffers,
    refetchTokens,
    selfUnshieldedHex,
    canMint: !!tradeWallet?.canMint && !!contractWallet,
    contractBusy: contract.loading,
    mintShielded,
    mintUnshielded,
    onMinted,
    canTrade: !!tradeWallet?.canTrade,
    createOffer,
    takeOffer,
    pendingConfirm,
    requestTake,
    requestTakeMany,
    takePreparing,
    takerShortfall,
    closeConfirm,
    myTrades,
    clearTrade,
    clearAllTrades,
    importOffer,
    previewOffer,
  };
}
