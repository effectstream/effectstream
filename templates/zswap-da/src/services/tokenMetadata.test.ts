import { describe, expect, test } from 'bun:test';
import {
  displayTokenLabel,
  normalizeTokenColor,
  parseTokenMetadataResponse,
  resolveTokenMetadataConfig,
  TokenMetadataStore,
} from './tokenMetadata';

const COLOR = 'ab'.repeat(32);
const OTHER = 'cd'.repeat(32);
const config = { baseUrl: 'https://offers.test/token-metadata', networkId: 'stagenet' };

const token = (kind: 0 | 1, over: Record<string, unknown> = {}) => ({
  color: COLOR,
  kind,
  privacy: kind === 1 ? 'shielded' : 'unshielded',
  storage: 'native',
  name: kind === 1 ? 'Private Example' : 'Public Example',
  symbol: kind === 1 ? 'PEX' : 'UEX',
  ...over,
});

const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function manualClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, () => void>();
  return {
    now: () => now,
    setNow: (value: number) => { now = value; },
    setTimer: (fn: () => void) => {
      const id = next++;
      timers.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id: ReturnType<typeof setTimeout>) => timers.delete(id as unknown as number),
    fireTimers: () => {
      const queued = [...timers.values()];
      timers.clear();
      queued.forEach((fn) => fn());
    },
  };
}

describe('token metadata parsing', () => {
  test('normalizes only complete 32-byte colors', () => {
    expect(normalizeTokenColor(`  0x${COLOR.toUpperCase()}  `)).toBe(COLOR);
    expect(normalizeTokenColor('abc')).toBeNull();
    expect(normalizeTokenColor('zz'.repeat(32))).toBeNull();
  });

  test('keeps native privacy kinds separate and prefers name over symbol', () => {
    expect(parseTokenMetadataResponse([
      token(0, { name: '  ', symbol: 'PUB' }),
      token(1, { name: ' Private Coin ', symbol: 'PRV' }),
      token(1, { kind: 3, storage: 'ledger', color: null, name: 'Ledger Coin' }),
    ], COLOR)).toEqual({ shielded: 'Private Coin', unshielded: 'PUB' });
  });

  test('rejects duplicate and inconsistent rows without borrowing another kind', () => {
    expect(parseTokenMetadataResponse([token(1), token(1, { name: 'Duplicate' }), token(0)], COLOR))
      .toEqual({ shielded: null, unshielded: 'Public Example' });
    expect(parseTokenMetadataResponse([
      token(1, { privacy: 'unshielded' }),
      token(0, { storage: 'ledger' }),
    ], COLOR)).toEqual({ shielded: null, unshielded: null });
  });

  test('requires the API bare-array shape and falls back predictably', () => {
    expect(() => parseTokenMetadataResponse({ items: [token(1)] }, COLOR)).toThrow();
    expect(displayTokenLabel(null, 'INTERNAL', COLOR)).toBe('INTERNAL');
    expect(displayTokenLabel(' Indexed ', 'INTERNAL', COLOR)).toBe('Indexed');
    expect(displayTokenLabel(null, ' ', COLOR)).toBe('ababab…abab');
  });
});

describe('token metadata configuration', () => {
  test('requires a matching explicit network and accepts a same-origin proxy', () => {
    expect(resolveTokenMetadataConfig('/token-metadata/', 'stagenet', 'STAGENET', 'https://offers.test'))
      .toEqual({ baseUrl: 'https://offers.test/token-metadata', networkId: 'stagenet' });
    expect(resolveTokenMetadataConfig('/token-metadata', 'preview', 'stagenet', 'https://offers.test')).toBeNull();
    expect(resolveTokenMetadataConfig('', 'stagenet', 'stagenet', 'https://offers.test')).toBeNull();
    expect(resolveTokenMetadataConfig('file:///tmp/index', 'stagenet', 'stagenet', 'https://offers.test')).toBeNull();
  });
});

describe('TokenMetadataStore', () => {
  test('disabled configuration makes no request', async () => {
    let calls = 0;
    const store = new TokenMetadataStore(null, { fetch: async () => { calls++; return response([]); } });
    expect(await store.request(COLOR, 'shielded')).toBeNull();
    expect(calls).toBe(0);
  });

  test('deduplicates a color lookup while returning kind-specific labels', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    let calls = 0;
    const store = new TokenMetadataStore(config, { fetch: async () => { calls++; return pending.promise; } });
    const shielded = store.request(COLOR, 'shielded');
    const unshielded = store.request(COLOR, 'unshielded');
    expect(calls).toBe(1);
    pending.resolve(response([token(1), token(0)]));
    expect(await shielded).toBe('Private Example');
    expect(await unshielded).toBe('Public Example');
    expect(calls).toBe(1);
  });

  test('requests the stable color and switches from immediate fallback only after the response', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    let requested = '';
    const store = new TokenMetadataStore(config, {
      fetch: async (url) => { requested = url; return pending.promise; },
    });
    const lookup = store.request(COLOR, 'shielded');
    expect(displayTokenLabel(store.peek(COLOR, 'shielded'), 'INTERNAL', COLOR)).toBe('INTERNAL');
    pending.resolve(response([token(1, { name: 'Issuer Name' })]));
    expect(await lookup).toBe('Issuer Name');
    expect(displayTokenLabel(store.peek(COLOR, 'shielded'), 'INTERNAL', COLOR)).toBe('Issuer Name');
    expect(requested).toBe(`${config.baseUrl}/v1/tokens/by-color/${COLOR}`);
  });

  test('limits concurrent requests to four and drains the remaining active lookup', async () => {
    const colors = ['01', '02', '03', '04', '05'].map((prefix) => prefix.repeat(32));
    const pending = colors.map(() => deferred<ReturnType<typeof response>>());
    let calls = 0;
    const store = new TokenMetadataStore(config, {
      fetch: async () => pending[calls++].promise,
      maxConcurrency: 4,
    });
    const lookups = colors.map((color) => store.request(color, 'shielded'));
    expect(calls).toBe(4);
    pending[0].resolve(response([token(1, { color: colors[0] })]));
    expect(await lookups[0]).toBe('Private Example');
    await Promise.resolve();
    expect(calls).toBe(5);
    for (let i = 1; i < pending.length; i++) {
      pending[i].resolve(response([token(1, { color: colors[i] })]));
    }
    expect(await Promise.all(lookups.slice(1))).toEqual([
      'Private Example',
      'Private Example',
      'Private Example',
      'Private Example',
    ]);
  });

  test('bounds the whole attempt including body parsing', async () => {
    const clock = manualClock();
    let aborted = false;
    const never = deferred<unknown>();
    const store = new TokenMetadataStore(config, {
      fetch: async (_url, init) => {
        init?.signal?.addEventListener('abort', () => { aborted = true; });
        return { ok: true, json: () => never.promise };
      },
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      attemptTimeoutMs: 3_000,
    });
    const result = store.request(COLOR, 'shielded');
    await Promise.resolve();
    clock.fireTimers();
    expect(await result).toBeNull();
    expect(aborted).toBe(true);
  });

  test('honors positive expiry, negative backoff and service recovery', async () => {
    const clock = manualClock();
    let calls = 0;
    let mode: 'named' | 'empty' | 'fail' = 'named';
    const store = new TokenMetadataStore(config, {
      fetch: async () => {
        calls++;
        if (mode === 'fail') throw new Error('offline');
        return response(mode === 'named' ? [token(1)] : []);
      },
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      positiveTtlMs: 300_000,
      negativeTtlMs: 30_000,
    });

    expect(await store.request(COLOR, 'shielded')).toBe('Private Example');
    expect(await store.request(COLOR, 'shielded')).toBe('Private Example');
    expect(calls).toBe(1);
    clock.setNow(300_001);
    mode = 'empty';
    expect(await store.request(COLOR, 'shielded')).toBeNull();
    expect(calls).toBe(2);
    expect(await store.request(COLOR, 'shielded')).toBeNull();
    expect(calls).toBe(2);

    clock.setNow(330_002);
    mode = 'fail';
    expect(await store.request(COLOR, 'shielded')).toBeNull();
    expect(calls).toBe(3);
    expect(await store.request(OTHER, 'shielded')).toBeNull();
    expect(calls).toBe(3);

    clock.setNow(360_003);
    mode = 'named';
    expect(await store.request(COLOR, 'shielded')).toBe('Private Example');
    expect(calls).toBe(4);
  });

  test('notifies at positive expiry and shows fallback while replacement is pending', async () => {
    const clock = manualClock();
    const replacement = deferred<ReturnType<typeof response>>();
    let calls = 0;
    let notifications = 0;
    const store = new TokenMetadataStore(config, {
      fetch: async () => {
        calls++;
        return calls === 1 ? response([token(1)]) : replacement.promise;
      },
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      positiveTtlMs: 300_000,
    });
    store.subscribe(() => { notifications++; });
    expect(await store.request(COLOR, 'shielded')).toBe('Private Example');
    const afterStore = notifications;
    clock.setNow(300_000);
    clock.fireTimers();
    expect(notifications).toBe(afterStore + 1);
    expect(store.peek(COLOR, 'shielded')).toBeNull();
    const pending = store.request(COLOR, 'shielded');
    expect(store.peek(COLOR, 'shielded')).toBeNull();
    replacement.resolve(response([token(1, { name: 'Fresh Name' })]));
    expect(await pending).toBe('Fresh Name');
    expect(store.peek(COLOR, 'shielded')).toBe('Fresh Name');
  });

  test('configuration changes abort and discard stale completions', async () => {
    const first = deferred<ReturnType<typeof response>>();
    let aborted = false;
    const store = new TokenMetadataStore(config, {
      fetch: async (url, init) => {
        if (url.startsWith(config.baseUrl)) {
          init?.signal?.addEventListener('abort', () => { aborted = true; first.reject(new Error('aborted')); });
          return first.promise;
        }
        return response([token(1, { name: 'New Network Name' })]);
      },
    });
    const stale = store.request(COLOR, 'shielded');
    store.configure({ baseUrl: 'https://new.test/meta', networkId: 'preview' });
    expect(await stale).toBeNull();
    expect(aborted).toBe(true);
    expect(await store.request(COLOR, 'shielded')).toBe('New Network Name');
    expect(store.peek(COLOR, 'shielded')).toBe('New Network Name');
  });

  test('clear removes cached labels and cache size remains bounded', async () => {
    const store = new TokenMetadataStore(config, {
      fetch: async (url) => response([token(1, {
        color: url.endsWith(COLOR) ? COLOR : OTHER,
        name: url.endsWith(COLOR) ? 'First' : 'Second',
      })]),
      maxEntries: 1,
    });
    expect(await store.request(COLOR, 'shielded')).toBe('First');
    expect(await store.request(OTHER, 'shielded')).toBe('Second');
    expect(store.peek(COLOR, 'shielded')).toBeNull();
    expect(store.peek(OTHER, 'shielded')).toBe('Second');
    store.clear();
    expect(store.peek(OTHER, 'shielded')).toBeNull();
  });
});
