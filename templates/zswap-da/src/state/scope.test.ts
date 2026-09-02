// Scoped-storage primitives: key format, the one-time migration of pre-scoping
// flat arrays, and the "never throw on junk" contract the callers rely on.
import { beforeEach, describe, expect, test } from 'bun:test';
import { LEGACY_SCOPE, bucketOf, buildScope, readBuckets, writeBuckets } from './scope';

// Minimal localStorage stand-in — bun's test runtime has no DOM.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

const KEY = 'test:store';
beforeEach(() => mem.clear());

describe('buildScope', () => {
  test('joins network and shielded address with ::', () => {
    expect(buildScope('preprod', 'mn_shield-addr_test1abc')).toBe('preprod::mn_shield-addr_test1abc');
  });

  test('the same wallet on two networks gets two scopes', () => {
    const addr = 'mn_shield-addr_test1abc';
    expect(buildScope('preprod', addr)).not.toBe(buildScope('undeployed', addr));
  });

  test('the local JS wallet (raw hex coin key) scopes like any other', () => {
    expect(buildScope('undeployed', 'ab'.repeat(32))).toBe(`undeployed::${'ab'.repeat(32)}`);
  });

  test('no wallet → null (nothing is mine, writes are refused)', () => {
    expect(buildScope('preprod', null)).toBeNull();
    expect(buildScope('preprod', undefined)).toBeNull();
    expect(buildScope('preprod', '')).toBeNull();
    expect(buildScope(null, 'mn_shield-addr_test1abc')).toBeNull();
  });
});

describe('readBuckets', () => {
  test('absent key → empty store', () => {
    expect(readBuckets(KEY)).toEqual({});
  });

  test('pre-scoping flat array migrates into the legacy bucket', () => {
    mem.set(KEY, JSON.stringify(['offer-a', 'offer-b']));
    expect(readBuckets<string>(KEY)).toEqual({ [LEGACY_SCOPE]: ['offer-a', 'offer-b'] });
  });

  test('migration is idempotent once written back', () => {
    mem.set(KEY, JSON.stringify(['offer-a']));
    const migrated = readBuckets<string>(KEY);
    writeBuckets(KEY, migrated);
    expect(readBuckets<string>(KEY)).toEqual(migrated);
  });

  test('already-scoped object is read as-is', () => {
    const stored = { 'preprod::w1': ['a'], 'preprod::w2': ['b'], legacy: ['c'] };
    mem.set(KEY, JSON.stringify(stored));
    expect(readBuckets<string>(KEY)).toEqual(stored);
  });

  test('non-array bucket values are dropped, not returned as junk', () => {
    mem.set(KEY, JSON.stringify({ 'preprod::w1': ['a'], broken: 'not-a-list' }));
    expect(readBuckets<string>(KEY)).toEqual({ 'preprod::w1': ['a'] });
  });

  test('malformed JSON degrades to empty — a convenience log never throws', () => {
    mem.set(KEY, '{not json');
    expect(readBuckets(KEY)).toEqual({});
  });

  test('a scalar value degrades to empty', () => {
    mem.set(KEY, JSON.stringify(42));
    expect(readBuckets(KEY)).toEqual({});
  });
});

describe('bucketOf', () => {
  const buckets = { 'preprod::w1': ['a'] };

  test('returns the scope bucket', () => {
    expect(bucketOf(buckets, 'preprod::w1')).toEqual(['a']);
  });

  test('unknown scope → empty, not undefined', () => {
    expect(bucketOf(buckets, 'preprod::w2')).toEqual([]);
  });

  test('null scope (no wallet) → empty', () => {
    expect(bucketOf(buckets, null)).toEqual([]);
  });
});

describe('writeBuckets round-trip', () => {
  test('stores the scoped shape and reads it back', () => {
    writeBuckets(KEY, { 'preprod::w1': ['a', 'b'], legacy: ['c'] });
    expect(JSON.parse(mem.get(KEY)!)).toEqual({ 'preprod::w1': ['a', 'b'], legacy: ['c'] });
    expect(readBuckets<string>(KEY)).toEqual({ 'preprod::w1': ['a', 'b'], legacy: ['c'] });
  });
});
