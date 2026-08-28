import { expect, test } from "bun:test";
import { getNtpTip } from "../src/sync-protocols/ntp/tip.ts";

test("resolves the inclusive page and aligned timestamp from one clock sample", async () => {
  let samples = 0;
  const tip = await getNtpTip({
    startTime: 10_000,
    blockTimeMS: 1_000,
    clock: {
      async getTime() {
        samples += 1;
        return { now: new Date(52_999), offset: 0 };
      },
    },
  });

  expect(tip).toEqual({ height: 42, timestamp: 52_999 });
  expect(samples).toBe(1);
  expect(10_000 + tip.height * 1_000).toBeLessThanOrEqual(tip.timestamp);
  expect(tip.timestamp).toBeLessThan(10_000 + (tip.height + 1) * 1_000);
});

test("rejects invalid network clocks and pre-genesis samples", async () => {
  await expect(getNtpTip({
    startTime: 0,
    blockTimeMS: 0,
    clock: { getTime: async () => ({ now: new Date(0), offset: 0 }) },
  })).rejects.toThrow(/blockTimeMS/);

  await expect(getNtpTip({
    startTime: 10_000,
    blockTimeMS: 1_000,
    clock: { getTime: async () => ({ now: new Date(1_000), offset: 0 }) },
  })).rejects.toThrow(/invalid block height/);
});
