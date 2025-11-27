import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  connectInjectedWallet,
} from "./utils.ts";
import type { IInjectedConnector, IProvider } from "./IProvider.ts";
import { AddressType } from "@effectstream/utils";

const MOCK_ADDRESS = "0xmock";
const MOCK_METADATA = { name: "MockWallet", displayName: "Mock Wallet", icon: "", version: "1.0" };

// Mock provider
const createMockProvider = (): IProvider<unknown> => ({
  getConnection: () => ({ metadata: MOCK_METADATA, api: {} }),
  getAddress: () => ({ type: AddressType.EVM, address: MOCK_ADDRESS }),
  signMessage: async () => "0xsig",
});

// Mock connector
const createMockConnector = (shouldFail = false): IInjectedConnector<unknown> => ({
  connectSimple: async () => {
    if (shouldFail) throw new Error("Simple connect failed");
    return createMockProvider();
  },
  connectNamed: async (name: string) => {
    if (shouldFail) throw new Error(`Named connect to ${name} failed`);
    return createMockProvider();
  },
  connectExternal: async () => {
    if (shouldFail) throw new Error("External connect failed");
    return createMockProvider();
  },
});

Deno.test("connectInjectedWallet - simple login success", async () => {
  const connector = createMockConnector();
  const provider = await connectInjectedWallet("Test", undefined, connector);
  assertEquals(provider.getAddress().address, MOCK_ADDRESS);
});

Deno.test("connectInjectedWallet - named login success", async () => {
  const connector = createMockConnector();
  const preference = { name: "MockWallet" };
  const provider = await connectInjectedWallet("Test", preference, connector);
  assertEquals(provider.getAddress().address, MOCK_ADDRESS);
});

Deno.test("connectInjectedWallet - external connection success", async () => {
  const connector = createMockConnector();
  const preference = { 
    connection: { 
        api: {}, 
        metadata: MOCK_METADATA 
    } 
  };
  const provider = await connectInjectedWallet("Test", preference, connector);
  assertEquals(provider.getAddress().address, MOCK_ADDRESS);
});

Deno.test("connectInjectedWallet - handles failure", async () => {
  const connector = createMockConnector(true);
  await assertRejects(
    () => connectInjectedWallet("Test", undefined, connector),
    Error,
    "Simple connect failed"
  );
});
