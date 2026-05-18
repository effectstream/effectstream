// Examples for the README. Wallets is browser-only — so we exercise the
// public API through a mock IInjectedConnector, the same pattern as
// src/utils.test.ts.

import { test, expect } from "bun:test";
import { connectInjectedWallet } from "../src/utils.ts";
import { WalletMode, WalletNameMap } from "../src/mod.ts";
import type { IInjectedConnector, IProvider } from "../src/IProvider.ts";
import { AddressType } from "@effectstream/utils";

const MOCK_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const MOCK_METADATA = {
  name: "MockWallet",
  displayName: "Mock Wallet",
  icon: "",
  version: "1.0",
};

const mockProvider = (): IProvider<unknown> => ({
  getConnection: () => ({ metadata: MOCK_METADATA, api: {} }),
  getAddress: () => ({ type: AddressType.EVM, address: MOCK_ADDRESS }),
  signMessage: async () => "0xsignedmessage",
});

const mockConnector = (): IInjectedConnector<unknown> => ({
  connectSimple: async () => mockProvider(),
  connectNamed: async (_name: string) => mockProvider(),
  connectExternal: async () => mockProvider(),
});

test("README: WalletNameMap covers every WalletMode", () => {
  for (
    const mode of [
      WalletMode.EvmInjected,
      WalletMode.EvmEthers,
      WalletMode.Midnight,
      WalletMode.Cardano,
      WalletMode.Polkadot,
      WalletMode.Algorand,
      WalletMode.Mina,
      WalletMode.AvailJs,
    ]
  ) {
    expect(typeof WalletNameMap[mode]).toBe("string");
    expect(WalletNameMap[mode].length).toBeGreaterThan(0);
  }
});

test("README: connectInjectedWallet returns an IProvider with address + sign", async () => {
  const provider = await connectInjectedWallet(
    "EVM",
    { name: MOCK_METADATA.name },
    mockConnector(),
  );

  const { type, address } = provider.getAddress();
  expect(type).toBe(AddressType.EVM);
  expect(address).toBe(MOCK_ADDRESS);

  const signature = await provider.signMessage("Sign in 2026-05-14");
  expect(signature).toBe("0xsignedmessage");
});
