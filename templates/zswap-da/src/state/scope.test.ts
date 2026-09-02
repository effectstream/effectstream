// Scoped-storage primitives: key format, the "anything that isn't a bucket
// object reads as empty" rule that discards the pre-scoping flat arrays, and the
// "never throw on junk" contract the callers rely on.
import { beforeEach, describe, expect, test } from 'bun:test';
import { bucketOf, buildScope, readBuckets, writeBuckets } from './scope';

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

  // The pre-scoping shape. It is DISCARDED, not migrated: an unscoped record
  // cannot be attributed to a wallet without guessing, and the app is alpha.
  test('a pre-scoping flat array reads as empty and is not migrated', () => {
    mem.set(KEY, JSON.stringify(['offer-a', 'offer-b']));
    expect(readBuckets<string>(KEY)).toEqual({});
  });

  test('the discarded array is simply overwritten by the next write', () => {
    mem.set(KEY, JSON.stringify(['offer-a']));
    writeBuckets(KEY, { ...readBuckets<string>(KEY), 'preprod::w1': ['new'] });
    expect(readBuckets<string>(KEY)).toEqual({ 'preprod::w1': ['new'] });
  });

  test('already-scoped object is read as-is', () => {
    const stored = { 'preprod::w1': ['a'], 'preprod::w2': ['b'] };
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
    writeBuckets(KEY, { 'preprod::w1': ['a', 'b'], 'preprod::w2': ['c'] });
    expect(JSON.parse(mem.get(KEY)!)).toEqual({ 'preprod::w1': ['a', 'b'], 'preprod::w2': ['c'] });
    expect(readBuckets<string>(KEY)).toEqual({ 'preprod::w1': ['a', 'b'], 'preprod::w2': ['c'] });
  });
});
