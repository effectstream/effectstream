// Timeout defaults that have to survive a real network, and the funding waits
// that must not be dragged along with them.
//
// Measured on preprod (master plan, "First real preprod sync measurements"):
// the dust cold sync takes ~66 minutes (1,438,641 indices at ~365 idx/s) while
// the unshielded sync takes ~1 second. `WALLET_SYNC_TIMEOUT_MS` was 10 minutes,
// an order of magnitude short — every default-configured cold sync on preprod
// fails, so this is a bug rather than a tunable.
//
// Raising it is not free: the same default was also the deadline for "wait for
// funds to arrive" and for the dust-registration precheck, neither of which is
// a sync question. An unfunded wallet would sit for hours, and the precheck —
// which in dust-only mode waits on an unshielded sub-wallet that has been
// stopped and can never complete (see the RegisterNightForDustOptions
// docstring) — would burn the same hours before giving up.

import { afterEach, describe, expect, test } from "bun:test";
import * as Rx from "rxjs";
import {
  registerNightForDust,
  resolveDustRegistrationPrecheckTimeoutMs,
  resolveWalletFundingTimeoutMs,
  resolveWalletSyncTimeoutMs,
} from "../src/get-wallet-info.ts";

/** Preprod's measured dust cold sync. A default below this cannot work. */
const PREPROD_COLD_SYNC_MS = 66 * 60 * 1000;

const ENV_KEYS = [
  "MIDNIGHT_WALLET_SYNC_TIMEOUT_MS",
  "MIDNIGHT_WALLET_FUNDING_TIMEOUT_MS",
  "MIDNIGHT_DUST_REGISTRATION_PRECHECK_TIMEOUT_MS",
];
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("sync timeout must outlast a real cold sync", () => {
  test("the default survives a preprod dust cold sync with headroom", () => {
    expect(resolveWalletSyncTimeoutMs()).toBeGreaterThan(PREPROD_COLD_SYNC_MS * 2);
  });

  test("the env override wins and a bad value falls back to the default", () => {
    process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS = "1234";
    expect(resolveWalletSyncTimeoutMs()).toEqual(1234);
    process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS = "not-a-number";
    expect(resolveWalletSyncTimeoutMs()).toBeGreaterThan(PREPROD_COLD_SYNC_MS * 2);
  });
});

describe("waiting for funds is not waiting for a sync", () => {
  test("the funding wait keeps its own, much shorter default", () => {
    // A wallet that will never be funded must fail in minutes, not hours.
    expect(resolveWalletFundingTimeoutMs()).toEqual(600_000);
    expect(resolveWalletFundingTimeoutMs()).toBeLessThan(resolveWalletSyncTimeoutMs());
  });

  test("the registration precheck keeps its own default too", () => {
    // In dust-only mode this wait can never succeed — the unshielded wallet it
    // waits on has been stopped — so it must stay bounded by something small.
    expect(resolveDustRegistrationPrecheckTimeoutMs()).toEqual(600_000);
    expect(resolveDustRegistrationPrecheckTimeoutMs())
      .toBeLessThan(resolveWalletSyncTimeoutMs());
  });

  test("both are independently configurable", () => {
    process.env.MIDNIGHT_WALLET_FUNDING_TIMEOUT_MS = "5000";
    process.env.MIDNIGHT_DUST_REGISTRATION_PRECHECK_TIMEOUT_MS = "7000";
    expect(resolveWalletFundingTimeoutMs()).toEqual(5000);
    expect(resolveDustRegistrationPrecheckTimeoutMs()).toEqual(7000);
  });
});

describe("registerNightForDust reports failure rather than throwing it", () => {
  test("a precheck timeout returns false like every other failure there", async () => {
    // The precheck's Rx.timeout threw from OUTSIDE the function's own
    // try/catch, so this one failure mode escaped as an exception while every
    // other one returned false. Callers that treated the boolean as the whole
    // contract skipped their own handling for it.
    const walletResult = {
      wallet: { state: () => Rx.NEVER },
    } as unknown as Parameters<typeof registerNightForDust>[0];

    await expect(
      registerNightForDust(walletResult, { precheckSyncTimeoutMs: 50 }),
    ).resolves.toBe(false);
  });
});
