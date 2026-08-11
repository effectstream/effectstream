import { test, expect } from "bun:test";
import { InMemoryRateLimitStore, RateLimiter } from "./rate-limiter.ts";
import {
  buildPreAuthRateLimitBuckets,
  buildRateLimitBuckets,
} from "../server/batcher-server.ts";
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

// --- buildRateLimitBuckets: which authenticated quotas are consumed ---

test("buildPreAuthRateLimitBuckets uses only the encoded source IP", () => {
  expect(buildPreAuthRateLimitBuckets("2001:db8::1", 50)).toEqual([{
    key: "pre-auth:ip:2001%3Adb8%3A%3A1",
    maxRequests: 50,
  }]);
});

test("buildRateLimitBuckets - ip strategy includes target-global and IP buckets", () => {
  expect(
    buildRateLimitBuckets("ip", "solana", "1.1.1.1", "addr1", 10, 100),
  ).toEqual([
    { key: "target:solana:global", maxRequests: 100 },
    { key: "target:solana:ip:1.1.1.1", maxRequests: 10 },
  ]);
});

test("buildRateLimitBuckets - ip-and-address gives the IP the global ceiling", () => {
  expect(
    buildRateLimitBuckets(
      "ip-and-address",
      "solana",
      "1.1.1.1",
      "addr1",
      10,
      100,
    ),
  ).toEqual([
    { key: "target:solana:global", maxRequests: 100 },
    { key: "target:solana:ip:1.1.1.1", maxRequests: 100 },
    { key: "target:solana:addr:addr1", maxRequests: 10 },
  ]);
});

test("buildRateLimitBuckets - missing address cannot create an identity bucket", () => {
  expect(
    buildRateLimitBuckets(
      "ip-and-address",
      "solana",
      "1.1.1.1",
      undefined,
      10,
      100,
    ),
  ).toEqual([
    { key: "target:solana:global", maxRequests: 100 },
    { key: "target:solana:ip:1.1.1.1", maxRequests: 100 },
  ]);
});

test("buildRateLimitBuckets - composite is scoped to the adapter target", () => {
  expect(
    buildRateLimitBuckets(
      "composite",
      "solana/main",
      "2001:db8::1",
      "addr1",
      10,
      100,
    ),
  ).toEqual([
    { key: "target:solana%2Fmain:global", maxRequests: 100 },
    {
      key: "target:solana%2Fmain:composite:2001%3Adb8%3A%3A1:addr1",
      maxRequests: 10,
    },
  ]);
});

test("ip-and-address isolates wallets behind one NAT until the global cap", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 2, 60000);
  const SHARED_IP = "203.0.113.7";

  for (let i = 0; i < 2; i++) {
    const r = await limiter.checkBuckets(
      buildRateLimitBuckets(
        "ip-and-address",
        "solana",
        SHARED_IP,
        "walletA",
        2,
        4,
      ),
    );
    expect(r.allowed).toEqual(true);
  }

  const blockedA = await limiter.checkBuckets(
    buildRateLimitBuckets(
      "ip-and-address",
      "solana",
      SHARED_IP,
      "walletA",
      2,
      4,
    ),
  );
  expect(blockedA.allowed).toEqual(false);
  expect(blockedA.limitedKey).toEqual("target:solana:addr:walletA");

  const allowedB = await limiter.checkBuckets(
    buildRateLimitBuckets(
      "ip-and-address",
      "solana",
      SHARED_IP,
      "walletB",
      2,
      4,
    ),
  );
  expect(allowedB.allowed).toEqual(true);
  expect(
    await store.count("target:solana:addr:walletB", Date.now(), 60000),
  ).toEqual(1);
});

test("target-global bucket caps different IPs and wallets together", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 10, 60000);

  for (const [ip, wallet] of [["1.1.1.1", "a"], ["2.2.2.2", "b"]]) {
    const result = await limiter.checkBuckets(
      buildRateLimitBuckets(
        "ip-and-address",
        "solana",
        ip,
        wallet,
        10,
        2,
      ),
    );
    expect(result.allowed).toBe(true);
  }

  const blocked = await limiter.checkBuckets(
    buildRateLimitBuckets(
      "ip-and-address",
      "solana",
      "3.3.3.3",
      "c",
      10,
      2,
    ),
  );
  expect(blocked.allowed).toBe(false);
  expect(blocked.limitedKey).toBe("target:solana:global");
});

test("target-global buckets do not couple different adapter targets", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  const first = await limiter.checkBuckets(
    buildRateLimitBuckets("ip", "solana-a", "1.1.1.1", "a", 1, 1),
  );
  const second = await limiter.checkBuckets(
    buildRateLimitBuckets("ip", "solana-b", "1.1.1.1", "a", 1, 1),
  );
  expect(first.allowed).toBe(true);
  expect(second.allowed).toBe(true);
});

test("atomic consume admits only one concurrent request at a limit of one", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 1, 60000);
  const results = await Promise.all(
    Array.from({ length: 50 }, () => limiter.check(["target:solana:global"])),
  );
  expect(results.filter((result) => result.allowed)).toHaveLength(1);
  expect(results.filter((result) => !result.allowed)).toHaveLength(49);
});

test("concurrent IPs and wallets cannot overshoot the target-global cap", async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, 100, 60000);
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      limiter.checkBuckets(
        buildRateLimitBuckets(
          "ip-and-address",
          "solana",
          `192.0.2.${index + 1}`,
          `wallet-${index + 1}`,
          100,
          1,
        ),
      )),
  );
  expect(results.filter((result) => result.allowed)).toHaveLength(1);
  expect(results.filter((result) => !result.allowed)).toHaveLength(49);
  expect(
    results.filter((result) => !result.allowed).every((result) =>
      result.limitedKey === "target:solana:global"
    ),
  ).toBe(true);
});

test("omitting rateLimit does not disable rate limiting", () => {
  // The server falls back to these when config.rateLimit is absent. A future
  // change to "no config means unlimited" would be a silent spend regression
  // for every batcher that never set the key.
  expect(DEFAULT_CONFIG_VALUES.rateLimit.maxRequests).toBeGreaterThan(0);
  expect(DEFAULT_CONFIG_VALUES.rateLimit.windowMs).toBeGreaterThan(0);
  expect(DEFAULT_CONFIG_VALUES.rateLimit).toEqual({
    preAuthMaxRequests: 1000,
    maxRequests: 1000,
    globalMaxRequests: 1000,
    windowMs: 86400000,
  });
});
