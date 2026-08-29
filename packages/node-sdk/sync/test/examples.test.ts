// Examples for the README — verify public exports resolve.

import { test, expect } from "bun:test";
import * as sync from "../src/mod.ts";

test("README: genSyncProtocols is exported as a generator factory", () => {
  expect(typeof sync.genSyncProtocols).toBe("function");
});

test("README: per-chain fetchers and states are exported", () => {
  // A sampling of the protocols supported by the package.
  expect("EvmFetcher" in sync).toBe(true);
  expect("BitcoinFetcher" in sync).toBe(true);
  expect("MidnightFetcher" in sync).toBe(true);
  expect("AvailFetcher" in sync).toBe(true);
  expect("UtxoRpcFetcher" in sync).toBe(true);
  expect("CelestiaFetcher" in sync).toBe(true);
  expect(typeof sync.getMidnightTip).toBe("function");
  expect(typeof sync.MidnightTipError).toBe("function");
  expect(typeof sync.getNtpTip).toBe("function");
  expect(typeof sync.NtpTipError).toBe("function");
});
