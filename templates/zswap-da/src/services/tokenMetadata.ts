import type { KnownToken } from '../types';
import { shortToken } from '../utils';

export type TokenPrivacy = KnownToken['kind'];

export interface TokenIdentity {
  color: string;
  kind: TokenPrivacy;
}

export interface TokenMetadataConfig {
  baseUrl: string;
  networkId: string;
}

export interface TokenMetadataLabels {
  shielded: string | null;
  unshielded: string | null;
}

const EMPTY_LABELS: TokenMetadataLabels = { shielded: null, unshielded: null };
const COLOR_RE = /^[0-9a-f]{64}$/;
const KINDS: readonly TokenPrivacy[] = ['shielded', 'unshielded'];

/** The token API uses lowercase, unprefixed 32-byte colours. */
export function normalizeTokenColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return COLOR_RE.test(normalized) ? normalized : null;
}

function usableLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the optional endpoint only when it is HTTP(S), explicitly bound to
 * the active Offer Files network, and non-empty. Relative bases support the
 * recommended same-origin proxy deployment.
 */
export function resolveTokenMetadataConfig(
  baseValue: unknown,
  networkValue: unknown,
  activeNetworkValue: unknown,
  pageOrigin: string,
): TokenMetadataConfig | null {
  const rawBase = typeof baseValue === 'string' ? baseValue.trim() : '';
  const networkId = typeof networkValue === 'string' ? networkValue.trim().toLowerCase() : '';
  const activeNetworkId = typeof activeNetworkValue === 'string' ? activeNetworkValue.trim().toLowerCase() : '';
  if (!rawBase || !networkId || !activeNetworkId || networkId !== activeNetworkId) return null;
  try {
    const url = new URL(rawBase, pageOrigin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { baseUrl: url.toString().replace(/\/+$/, ''), networkId };
  } catch {
    return null;
  }
}

/**
 * Parse one `GET /v1/tokens/by-color/:color` bare-array response. Only the two
 * native kinds can label Offer Files assets. A duplicate or contradictory row
 * makes that kind unusable; unrelated ledger-kind rows are ignored.
 */
export function parseTokenMetadataResponse(body: unknown, requestedColor: string): TokenMetadataLabels {
  const color = normalizeTokenColor(requestedColor);
  if (!color || !Array.isArray(body)) throw new Error('Invalid token metadata response');

  const labels: TokenMetadataLabels = { ...EMPTY_LABELS };
  for (const kind of KINDS) {
    const apiKind = kind === 'shielded' ? 1 : 0;
    const candidates = body.filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row) && (row as Record<string, unknown>).kind === apiKind,
    );
    if (candidates.length !== 1) continue;
    const row = candidates[0];
    const expectedPrivacy = kind;
    if (
      normalizeTokenColor(row.color) !== color ||
      row.privacy !== expectedPrivacy ||
      row.storage !== 'native'
    ) continue;
    labels[kind] = usableLabel(row.name) ?? usableLabel(row.symbol);
  }
  return labels;
}

/** Indexed label → internal registry label → the existing shortened colour. */
export function displayTokenLabel(
  indexedLabel: string | null | undefined,
  internalLabel: string | null | undefined,
  color: string,
): string {
  return usableLabel(indexedLabel) ?? usableLabel(internalLabel) ?? shortToken(color);
}

type TimerHandle = ReturnType<typeof setTimeout>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

interface CacheEntry {
  labels: TokenMetadataLabels;
  freshUntil: Record<TokenPrivacy, number>;
  touchedAt: number;
}

interface QueueJob {
  color: string;
  generation: number;
  resolve: (labels: TokenMetadataLabels) => void;
}

export interface TokenMetadataStoreOptions {
  fetch?: FetchLike;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  attemptTimeoutMs?: number;
  positiveTtlMs?: number;
  negativeTtlMs?: number;
  maxEntries?: number;
  maxConcurrency?: number;
}

/**
 * Session-only metadata store. One color request supplies both native kinds,
 * while cache freshness stays kind-specific so a missing kind can recover
 * without throwing away the other kind's valid label.
 */
export class TokenMetadataStore {
  private config: TokenMetadataConfig | null;
  private readonly fetcher: FetchLike;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private readonly attemptTimeoutMs: number;
  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly maxEntries: number;
  private readonly maxConcurrency: number;
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<TokenMetadataLabels>>();
  private queue: QueueJob[] = [];
  private controllers = new Set<AbortController>();
  private expiryTimers = new Map<string, TimerHandle[]>();
  private listeners = new Set<() => void>();
  private running = 0;
  private generation = 0;
  private endpointFailures = 0;
  private endpointRetryAt = 0;

  constructor(config: TokenMetadataConfig | null, options: TokenMetadataStoreOptions = {}) {
    this.config = config;
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.attemptTimeoutMs = Math.min(3_000, Math.max(1, options.attemptTimeoutMs ?? 3_000));
    this.positiveTtlMs = Math.min(300_000, Math.max(1, options.positiveTtlMs ?? 300_000));
    this.negativeTtlMs = Math.max(30_000, options.negativeTtlMs ?? 30_000);
    this.maxEntries = Math.max(1, options.maxEntries ?? 256);
    this.maxConcurrency = Math.min(4, Math.max(1, options.maxConcurrency ?? 4));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  configure(config: TokenMetadataConfig | null): void {
    if (this.config?.baseUrl === config?.baseUrl && this.config?.networkId === config?.networkId) return;
    this.generation++;
    this.config = config;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.clearExpiryTimers();
    for (const job of this.queue.splice(0)) job.resolve({ ...EMPTY_LABELS });
    this.pending.clear();
    this.cache.clear();
    this.endpointFailures = 0;
    this.endpointRetryAt = 0;
    this.emit();
  }

  clear(): void {
    this.generation++;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.clearExpiryTimers();
    for (const job of this.queue.splice(0)) job.resolve({ ...EMPTY_LABELS });
    this.pending.clear();
    this.cache.clear();
    this.endpointFailures = 0;
    this.endpointRetryAt = 0;
    this.emit();
  }

  peek(colorValue: string, kind: TokenPrivacy): string | null {
    const color = normalizeTokenColor(colorValue);
    if (!color) return null;
    const entry = this.cache.get(color);
    if (!entry || entry.freshUntil[kind] <= this.now()) return null;
    entry.touchedAt = this.now();
    return entry.labels[kind];
  }

  request(colorValue: string, kind: TokenPrivacy): Promise<string | null> {
    const color = normalizeTokenColor(colorValue);
    if (!this.config || !color) return Promise.resolve(null);
    const cached = this.cache.get(color);
    if (cached && cached.freshUntil[kind] > this.now()) return Promise.resolve(cached.labels[kind]);

    const existing = this.pending.get(color);
    if (existing) return existing.then((labels) => labels[kind]);

    const generation = this.generation;
    const promise = new Promise<TokenMetadataLabels>((resolve) => {
      this.queue.push({ color, generation, resolve });
      this.drain();
    });
    this.pending.set(color, promise);
    return promise.then((labels) => labels[kind]);
  }

  private drain(): void {
    while (this.running < this.maxConcurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      if (job.generation !== this.generation || !this.config) {
        job.resolve({ ...EMPTY_LABELS });
        continue;
      }
      this.running++;
      void this.run(job).finally(() => {
        this.running--;
        if (job.generation === this.generation) this.pending.delete(job.color);
        this.drain();
      });
    }
  }

  private async run(job: QueueJob): Promise<void> {
    const now = this.now();
    if (this.endpointRetryAt > now) {
      const labels = { ...EMPTY_LABELS };
      this.store(job.color, labels, this.endpointRetryAt, this.endpointRetryAt, job.generation);
      job.resolve(labels);
      return;
    }

    const controller = new AbortController();
    this.controllers.add(controller);
    let rejectTimeout: ((reason: Error) => void) | undefined;
    const timedOut = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const timeout = this.setTimer(() => {
      controller.abort();
      rejectTimeout?.(new Error('Token metadata request timed out'));
    }, this.attemptTimeoutMs);
    try {
      const baseUrl = this.config!.baseUrl;
      const response = await Promise.race([
        this.fetcher(`${baseUrl}/v1/tokens/by-color/${job.color}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }),
        timedOut,
      ]);
      if (!response.ok) throw new Error('Token metadata request failed');
      const labels = parseTokenMetadataResponse(await Promise.race([response.json(), timedOut]), job.color);
      if (job.generation !== this.generation) {
        job.resolve({ ...EMPTY_LABELS });
        return;
      }
      this.endpointFailures = 0;
      this.endpointRetryAt = 0;
      const updatedAt = this.now();
      this.store(
        job.color,
        labels,
        updatedAt + (labels.shielded ? this.positiveTtlMs : this.negativeTtlMs),
        updatedAt + (labels.unshielded ? this.positiveTtlMs : this.negativeTtlMs),
        job.generation,
      );
      job.resolve(labels);
    } catch {
      if (job.generation !== this.generation) {
        job.resolve({ ...EMPTY_LABELS });
        return;
      }
      this.endpointFailures++;
      const backoff = Math.min(300_000, this.negativeTtlMs * 2 ** Math.min(3, this.endpointFailures - 1));
      this.endpointRetryAt = this.now() + backoff;
      const labels = { ...EMPTY_LABELS };
      this.store(job.color, labels, this.endpointRetryAt, this.endpointRetryAt, job.generation);
      job.resolve(labels);
    } finally {
      this.clearTimer(timeout);
      this.controllers.delete(controller);
    }
  }

  private store(
    color: string,
    labels: TokenMetadataLabels,
    shieldedFreshUntil: number,
    unshieldedFreshUntil: number,
    generation: number,
  ): void {
    if (generation !== this.generation) return;
    this.cache.delete(color);
    this.cache.set(color, {
      labels,
      freshUntil: { shielded: shieldedFreshUntil, unshielded: unshieldedFreshUntil },
      touchedAt: this.now(),
    });
    this.scheduleExpiryNotifications(color, labels, shieldedFreshUntil, unshieldedFreshUntil);
    while (this.cache.size > this.maxEntries) {
      let oldestKey: string | undefined;
      let oldest = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.cache) {
        if (entry.touchedAt < oldest && !this.pending.has(key)) {
          oldest = entry.touchedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
      this.cancelExpiryTimers(oldestKey);
    }
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private scheduleExpiryNotifications(
    color: string,
    labels: TokenMetadataLabels,
    shieldedFreshUntil: number,
    unshieldedFreshUntil: number,
  ): void {
    this.cancelExpiryTimers(color);
    const timers: TimerHandle[] = [];
    const schedule = (kind: TokenPrivacy, freshUntil: number) => {
      if (!labels[kind]) return;
      const handle = this.setTimer(() => {
        const current = this.cache.get(color);
        if (current?.freshUntil[kind] === freshUntil && this.now() >= freshUntil) this.emit();
      }, Math.max(0, freshUntil - this.now()));
      timers.push(handle);
    };
    schedule('shielded', shieldedFreshUntil);
    schedule('unshielded', unshieldedFreshUntil);
    if (timers.length > 0) this.expiryTimers.set(color, timers);
  }

  private cancelExpiryTimers(color: string): void {
    const timers = this.expiryTimers.get(color);
    if (timers) timers.forEach((timer) => this.clearTimer(timer));
    this.expiryTimers.delete(color);
  }

  private clearExpiryTimers(): void {
    for (const timers of this.expiryTimers.values()) timers.forEach((timer) => this.clearTimer(timer));
    this.expiryTimers.clear();
  }
}
