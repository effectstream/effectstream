import { test, expect } from "bun:test";
import { InMemoryRateLimitStore, RateLimiter } from "./rate-limiter.ts";

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
