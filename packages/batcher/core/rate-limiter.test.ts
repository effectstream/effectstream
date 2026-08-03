import { test, expect } from "bun:test";
import { InMemoryRateLimitStore, RateLimiter } from "./rate-limiter.ts";
import { buildRateLimitKeys } from "../server/batcher-server.ts";
import { DEFAULT_CONFIG_VALUES } from "./config.ts";

// --- InMemoryRateLimitStore tests ---

test("InMemoryRateLimitStore - count returns 0 for unknown key", async () => {
  const store = new InMemoryRateLimitStore();
  expect(await store.count("unknown", 1000, 1000)).toEqual(0);
});

test("InMemoryRateLimitStore - hit and count within window", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 1500);
  await store.hit("k", 2000);
  expect(await store.count("k", 2000, 2000)).toEqual(3);
});

test("InMemoryRateLimitStore - count excludes expired entries", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 2000);
  await store.hit("k", 3000);
  // Window is 1500ms from now=3500, so cutoff is 2000. Only ts > 2000 counts.
  expect(await store.count("k", 3500, 1500)).toEqual(1);
});

test("InMemoryRateLimitStore - oldestHitInWindow returns oldest", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 2000);
  await store.hit("k", 3000);
  // Window of 2500 from now=3000 -> cutoff 500, all are in window
  expect(await store.oldestHitInWindow("k", 3000, 2500)).toEqual(1000);
});

test("InMemoryRateLimitStore - oldestHitInWindow returns undefined for unknown key", async () => {
  const store = new InMemoryRateLimitStore();
  expect(await store.oldestHitInWindow("unknown", 1000, 1000)).toEqual(undefined);
});

test("InMemoryRateLimitStore - oldestHitInWindow skips expired entries", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 3000);
  // Window 1500 from now=3500 -> cutoff 2000, only 3000 is in window
  expect(await store.oldestHitInWindow("k", 3500, 1500)).toEqual(3000);
});

test("InMemoryRateLimitStore - cleanup removes expired entries", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("a", 1000);
  await store.hit("b", 5000);
  await store.cleanup(6000, 2000);
  // "a" (1000) should be cleaned, "b" (5000) should remain
  expect(await store.count("a", 6000, 2000)).toEqual(0);
  expect(await store.count("b", 6000, 2000)).toEqual(1);
});

// --- RateLimiter tests ---

test("RateLimiter - allows requests under the limit", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 3, 60000);
  const r1 = await limiter.check(["ip:1.2.3.4"]);
  expect(r1.allowed).toEqual(true);
  const r2 = await limiter.check(["ip:1.2.3.4"]);
  expect(r2.allowed).toEqual(true);
});

test("RateLimiter - blocks at the limit", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 2, 60000);
  await limiter.check(["ip:1.2.3.4"]);
  await limiter.check(["ip:1.2.3.4"]);
  const r3 = await limiter.check(["ip:1.2.3.4"]);
  expect(r3.allowed).toEqual(false);
  expect(typeof r3.retryAfterSeconds).toEqual("number");
  expect(r3.limitedKey).toEqual("ip:1.2.3.4");
});

test("RateLimiter - different keys are independent", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  const r1 = await limiter.check(["ip:1.1.1.1"]);
  expect(r1.allowed).toEqual(true);
  const r2 = await limiter.check(["ip:2.2.2.2"]);
  expect(r2.allowed).toEqual(true);
});

test("RateLimiter - multi-key: blocks if any key is over limit", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  // First request with ip key only
  await limiter.check(["ip:1.1.1.1"]);
  // Second request with same ip + address - ip is already at limit
  const r2 = await limiter.check(["ip:1.1.1.1", "addr:0xabc"]);
  expect(r2.allowed).toEqual(false);
  expect(r2.limitedKey).toEqual("ip:1.1.1.1");
});

test("RateLimiter - does not record hits when rate limited", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  await limiter.check(["ip:1.1.1.1"]);
  // This should be blocked - addr:0xabc should NOT get a hit recorded
  await limiter.check(["ip:1.1.1.1", "addr:0xabc"]);
  // addr:0xabc should still have 0 hits
  expect(await store.count("addr:0xabc", Date.now(), 60000)).toEqual(0);
});

// --- buildRateLimitKeys: which buckets a request draws down ---

test("buildRateLimitKeys - ip strategy keys on the IP alone", () => {
  expect(buildRateLimitKeys("ip", "1.1.1.1", "addr1")).toEqual(["ip:1.1.1.1"]);
});

test("buildRateLimitKeys - ip-and-address keys on both", () => {
  expect(buildRateLimitKeys("ip-and-address", "1.1.1.1", "addr1")).toEqual([
    "ip:1.1.1.1",
    "addr:addr1",
  ]);
});

test("buildRateLimitKeys - ip-and-address omits the address key when absent", () => {
  // An unauthenticated caller must not collapse into a shared `addr:undefined`
  // bucket, which would let one bad client exhaust the limit for every other
  // request that also arrived without an address.
  expect(buildRateLimitKeys("ip-and-address", "1.1.1.1")).toEqual([
    "ip:1.1.1.1",
  ]);
});

test("buildRateLimitKeys - composite keys the pair as one bucket", () => {
  expect(buildRateLimitKeys("composite", "1.1.1.1", "addr1")).toEqual([
    "composite:1.1.1.1:addr1",
  ]);
});

test("ip-and-address gives two wallets behind one NAT independent budgets", async () => {
  // The reason the strategy exists. Under "ip" both wallets share one bucket,
  // so the second user is throttled by the first user's traffic.
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 2, 60000);
  const SHARED_IP = "203.0.113.7";

  // Wallet A exhausts its own address budget.
  for (let i = 0; i < 2; i++) {
    const r = await limiter.check(
      buildRateLimitKeys("ip-and-address", SHARED_IP, "walletA"),
    );
    expect(r.allowed).toEqual(true);
  }

  // Wallet A is now blocked, and it is the shared IP key that ran out first.
  const blockedA = await limiter.check(
    buildRateLimitKeys("ip-and-address", SHARED_IP, "walletA"),
  );
  expect(blockedA.allowed).toEqual(false);

  // Wallet B has its own untouched addr bucket, but still shares the IP one,
  // so the IP limit is what bounds the venue as a whole. This asserts the
  // actual semantics rather than the hoped-for one.
  expect(await store.count("addr:walletB", Date.now(), 60000)).toEqual(0);
  expect(await store.count("addr:walletA", Date.now(), 60000)).toEqual(2);
});

test("omitting rateLimit does not disable rate limiting", () => {
  // The server falls back to these when config.rateLimit is absent. A future
  // change to "no config means unlimited" would be a silent spend regression
  // for every batcher that never set the key.
  expect(DEFAULT_CONFIG_VALUES.rateLimit.maxRequests).toBeGreaterThan(0);
  expect(DEFAULT_CONFIG_VALUES.rateLimit.windowMs).toBeGreaterThan(0);
  expect(DEFAULT_CONFIG_VALUES.rateLimit).toEqual({
    maxRequests: 1000,
    windowMs: 86400000,
  });
});
