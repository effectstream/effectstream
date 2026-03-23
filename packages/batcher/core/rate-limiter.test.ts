import { assertEquals } from "jsr:@std/assert";
import { InMemoryRateLimitStore, RateLimiter } from "./rate-limiter.ts";

// --- InMemoryRateLimitStore tests ---

Deno.test("InMemoryRateLimitStore - count returns 0 for unknown key", async () => {
  const store = new InMemoryRateLimitStore();
  assertEquals(await store.count("unknown", 1000, 1000), 0);
});

Deno.test("InMemoryRateLimitStore - hit and count within window", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 1500);
  await store.hit("k", 2000);
  assertEquals(await store.count("k", 2000, 2000), 3);
});

Deno.test("InMemoryRateLimitStore - count excludes expired entries", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 2000);
  await store.hit("k", 3000);
  // Window is 1500ms from now=3500, so cutoff is 2000. Only ts > 2000 counts.
  assertEquals(await store.count("k", 3500, 1500), 1);
});

Deno.test("InMemoryRateLimitStore - oldestHitInWindow returns oldest", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 2000);
  await store.hit("k", 3000);
  // Window of 2500 from now=3000 -> cutoff 500, all are in window
  assertEquals(await store.oldestHitInWindow("k", 3000, 2500), 1000);
});

Deno.test("InMemoryRateLimitStore - oldestHitInWindow returns undefined for unknown key", async () => {
  const store = new InMemoryRateLimitStore();
  assertEquals(await store.oldestHitInWindow("unknown", 1000, 1000), undefined);
});

Deno.test("InMemoryRateLimitStore - oldestHitInWindow skips expired entries", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("k", 1000);
  await store.hit("k", 3000);
  // Window 1500 from now=3500 -> cutoff 2000, only 3000 is in window
  assertEquals(await store.oldestHitInWindow("k", 3500, 1500), 3000);
});

Deno.test("InMemoryRateLimitStore - cleanup removes expired entries", async () => {
  const store = new InMemoryRateLimitStore();
  await store.hit("a", 1000);
  await store.hit("b", 5000);
  await store.cleanup(6000, 2000);
  // "a" (1000) should be cleaned, "b" (5000) should remain
  assertEquals(await store.count("a", 6000, 2000), 0);
  assertEquals(await store.count("b", 6000, 2000), 1);
});

// --- RateLimiter tests ---

Deno.test("RateLimiter - allows requests under the limit", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 3, 60000);
  const r1 = await limiter.check(["ip:1.2.3.4"]);
  assertEquals(r1.allowed, true);
  const r2 = await limiter.check(["ip:1.2.3.4"]);
  assertEquals(r2.allowed, true);
});

Deno.test("RateLimiter - blocks at the limit", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 2, 60000);
  await limiter.check(["ip:1.2.3.4"]);
  await limiter.check(["ip:1.2.3.4"]);
  const r3 = await limiter.check(["ip:1.2.3.4"]);
  assertEquals(r3.allowed, false);
  assertEquals(typeof r3.retryAfterSeconds, "number");
  assertEquals(r3.limitedKey, "ip:1.2.3.4");
});

Deno.test("RateLimiter - different keys are independent", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  const r1 = await limiter.check(["ip:1.1.1.1"]);
  assertEquals(r1.allowed, true);
  const r2 = await limiter.check(["ip:2.2.2.2"]);
  assertEquals(r2.allowed, true);
});

Deno.test("RateLimiter - multi-key: blocks if any key is over limit", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  // First request with ip key only
  await limiter.check(["ip:1.1.1.1"]);
  // Second request with same ip + address - ip is already at limit
  const r2 = await limiter.check(["ip:1.1.1.1", "addr:0xabc"]);
  assertEquals(r2.allowed, false);
  assertEquals(r2.limitedKey, "ip:1.1.1.1");
});

Deno.test("RateLimiter - does not record hits when rate limited", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  await limiter.check(["ip:1.1.1.1"]);
  // This should be blocked - addr:0xabc should NOT get a hit recorded
  await limiter.check(["ip:1.1.1.1", "addr:0xabc"]);
  // addr:0xabc should still have 0 hits
  assertEquals(await store.count("addr:0xabc", Date.now(), 60000), 0);
});
