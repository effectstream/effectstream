// Examples for the README — verify the public re-export surface.

import { test, expect } from "bun:test";
import * as fe from "../src/mod.ts";

test("README: frontend-sdk re-exports WalletMode / WalletNameMap", () => {
  expect("WalletMode" in fe).toBe(true);
  expect("WalletNameMap" in fe).toBe(true);
});

test("README: frontend-sdk exposes high-level helpers", () => {
  expect(typeof fe.walletLogin).toBe("function");
  expect(typeof fe.allInjectedWallets).toBe("function");
  expect(typeof fe.getAddressType).toBe("function");
});

test("README: send/wait helpers are available", () => {
  expect(typeof fe.sendTransaction).toBe("function");
  expect(typeof fe.sendBatcherTransaction).toBe("function");
  expect(typeof fe.signMessage).toBe("function");
  expect(typeof fe.waitForEffectstreamBlockProcessed).toBe("function");
});
