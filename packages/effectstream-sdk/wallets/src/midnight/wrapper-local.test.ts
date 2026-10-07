import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AddressType } from "@effectstream/utils/types";
import type { IProvider } from "../IProvider.ts";
import type { LoginInfo } from "../wallet-modes.ts";
import { walletLogin } from "../wallets.ts";
import { WalletMode } from "../utils.ts";
import {
  MidnightLocalConnector,
  type MidnightLocalApi,
} from "./local.ts";

const SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const networkUrls = {
  indexer: "http://127.0.0.1:18088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:18088/api/v3/graphql/ws",
  node: "http://127.0.0.1:19944",
  proofServer: "http://127.0.0.1:16300",
};

describe("walletLogin MidnightLocal forwarding", () => {
  afterEach(() => {
    mock.restore();
  });

  function mockConnector() {
    const walletFacade = { kind: "facade" };
    const walletResult = { kind: "result", wallet: walletFacade };
    const api = { walletFacade, walletResult };
    const provider = {
      getAddress: () => ({
        type: AddressType.MIDNIGHT,
        address: "mn_addr_undeployed1test",
      }),
      getConnection: () => ({
        api,
        metadata: { name: "midnight-local", displayName: "Midnight local" },
      }),
      signMessage: mock(async () => "signature|verifying-key"),
    } as unknown as IProvider<unknown>;
    const connectFromSeed = mock(async () => provider);
    spyOn(MidnightLocalConnector, "instance").mockReturnValue({
      connectFromSeed,
    } as unknown as MidnightLocalConnector);

    return { api, connectFromSeed, provider, walletFacade, walletResult };
  }

  test("keeps the signing-only high-level login compatible when URLs are omitted", async () => {
    const { connectFromSeed, provider } = mockConnector();
    const loginInfo = {
      mode: WalletMode.MidnightLocal,
      seed: SEED,
      networkId: "undeployed",
    } satisfies LoginInfo;

    const result = await walletLogin(loginInfo);

    expect(result.success).toBe(true);
    expect(connectFromSeed).toHaveBeenCalledWith({
      seed: SEED,
      networkId: "undeployed",
    });
    if (result.success) {
      expect(result.result.provider).toBe(provider);
    }
  });

  test("forwards full-facade URLs and sync mode through the high-level login", async () => {
    const { connectFromSeed, provider, walletFacade, walletResult } =
      mockConnector();

    const loginInfo = {
      mode: WalletMode.MidnightLocal,
      seed: SEED,
      networkId: "undeployed",
      networkUrls,
      syncMode: "dust-only",
    } satisfies LoginInfo;
    const result = await walletLogin(loginInfo);

    expect(result.success).toBe(true);
    expect(connectFromSeed).toHaveBeenCalledTimes(1);
    expect(connectFromSeed).toHaveBeenCalledWith({
      seed: SEED,
      networkId: "undeployed",
      networkUrls,
      syncMode: "dust-only",
    });
    if (result.success) {
      expect(result.result.provider).toBe(provider);
      const api = result.result.provider.getConnection()
        .api as unknown as MidnightLocalApi;
      expect(api.walletFacade).toBe(walletFacade);
      expect(api.walletResult).toBe(walletResult);
    }
  });

  test.each([
    [
      "missing proof server",
      { ...networkUrls, proofServer: undefined },
      "networkUrls.proofServer is required",
    ],
    [
      "invalid indexer URL",
      { ...networkUrls, indexer: "not-a-url" },
      "networkUrls.indexer must be an absolute URL",
    ],
    [
      "wrong websocket protocol",
      { ...networkUrls, indexerWS: "https://127.0.0.1:18088/graphql" },
      "networkUrls.indexerWS must use ws: or wss:",
    ],
  ])("rejects %s before invoking the connector", async (_name, urls, message) => {
    const { connectFromSeed } = mockConnector();
    const result = await walletLogin({
      mode: WalletMode.MidnightLocal,
      seed: SEED,
      networkId: "undeployed",
      networkUrls: urls,
      syncMode: "all",
    } as LoginInfo);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorMessage).toContain(message);
    }
    expect(connectFromSeed).toHaveBeenCalledTimes(0);
  });
});
