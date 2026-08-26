import { describe, expect, mock, test } from "bun:test";
import { WalletMode } from "@effectstream/wallets";
import type { MidnightLocalApi } from "@effectstream/wallets/midnight-local";
import type { WalletResult } from "@effectstream/midnight-contracts/types";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import { connectMidnightLocalWallet } from "./midnight-wallet.ts";

const SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";
const defaultNetworkUrls = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};
const injectedNetworkUrls = {
  indexer: "http://127.0.0.1:18088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:18088/api/v3/graphql/ws",
  node: "http://127.0.0.1:19944",
  proofServer: "http://127.0.0.1:16300",
};

describe("MidnightLocal template selection", () => {
  test("undeployed uses the real lazy default resolver and logs in once through the high-level full facade", async () => {
    const walletFacade = {
      state: mock(() => ({ pipe: mock(() => ({})) })),
    } as unknown as WalletFacade;
    const walletResult = {
      wallet: walletFacade,
      zswapSecretKeys: {},
      walletZswapSecretKeys: {},
      dustSecretKey: {},
      walletDustSecretKey: {},
      dustAddress: "dust_undeployed1test",
      unshieldedAddress: "mn_addr_undeployed1test",
      unshieldedKeystore: {},
    } as unknown as WalletResult;
    const api: Pick<MidnightLocalApi, "walletFacade" | "walletResult"> = {
      walletFacade,
      walletResult,
    };
    const provider = {
      getConnection: () => ({
        api,
        metadata: { name: "midnight-local", displayName: "Midnight local" },
      }),
    };
    const resolveSeed = mock(() => SEED);
    const login = mock(async () => ({
      success: true as const,
      result: {
        provider,
        walletAddress: "mn_addr_undeployed1test",
        metadata: { name: "midnight-local", displayName: "Midnight local" },
      },
    }));
    const sync = mock(async () => ({
      shieldedBalance: 1n,
      unshieldedBalance: 2n,
      dustBalance: 3n,
    }));
    const providers = { kind: "counter-providers" };
    const configure = mock(async () => providers);

    const connected = await connectMidnightLocalWallet({
      networkId: "undeployed",
      resolveSeed,
      login: login as never,
      sync: sync as never,
      configure: configure as never,
    });

    expect(resolveSeed).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({
      mode: WalletMode.MidnightLocal,
      seed: SEED,
      networkId: "undeployed",
      networkUrls: defaultNetworkUrls,
      syncMode: "all",
    });
    expect(sync).toHaveBeenCalledWith(walletResult);
    expect(configure).toHaveBeenCalledWith(walletResult, defaultNetworkUrls);
    expect(connected.wallet).toBe(walletFacade);
    expect(connected.providers).toBe(providers);
  });

  test.each(["preview", "preprod", "mainnet"])(
    "%s fails on injected and production-default paths before cached-wallet, seed, endpoint, login, provider, or network seams",
    async (networkId) => {
      const resolveSeed = mock(() => SEED);
      const resolveNetworkUrls = mock(() => injectedNetworkUrls);
      const login = mock(async () => {
        throw new Error("must not log in");
      });
      const sync = mock(async () => {
        throw new Error("must not sync");
      });
      const configure = mock(async () => {
        throw new Error("must not construct providers");
      });

      await expect(
        connectMidnightLocalWallet({
          networkId,
          resolveSeed,
          resolveNetworkUrls,
          login: login as never,
          sync: sync as never,
          configure: configure as never,
        }),
      ).rejects.toThrow(
        `Selected "${networkId}" requires a supported external signer/profile`,
      );

      // Exercise the production dependency path too. Omitting the injected URL
      // resolver must still reject before the real lazy default can be used.
      await expect(
        connectMidnightLocalWallet({
          networkId,
          resolveSeed,
          login: login as never,
          sync: sync as never,
          configure: configure as never,
        }),
      ).rejects.toThrow(
        `Selected "${networkId}" requires a supported external signer/profile`,
      );

      expect(resolveSeed).toHaveBeenCalledTimes(0);
      expect(resolveNetworkUrls).toHaveBeenCalledTimes(0);
      expect(login).toHaveBeenCalledTimes(0);
      expect(sync).toHaveBeenCalledTimes(0);
      expect(configure).toHaveBeenCalledTimes(0);
    },
  );
});
