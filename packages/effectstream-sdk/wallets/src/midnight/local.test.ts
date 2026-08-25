import { describe, expect, mock, test } from "bun:test";
import { Buffer } from "node:buffer";
import { AddressType } from "@effectstream/utils/types";
import { verifySignature } from "@midnightntwrk/ledger-v9";
import { CryptoManager } from "@effectstream/crypto";
import { MidnightLocalConnector, type MidnightLocalApi } from "./local.ts";

const DETERMINISTIC_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

describe("MidnightLocalProvider", () => {
  test("derives an unshielded bech32 address from a deterministic seed", async () => {
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: DETERMINISTIC_SEED,
      networkId: "undeployed",
    });
    const { type, address } = provider.getAddress();
    expect(type).toBe(AddressType.MIDNIGHT);
    expect(typeof address).toBe("string");
    expect(address.length).toBeGreaterThan(0);
  });

  test("signMessage produces a signature that verifies via tagged ledger-v9 APIs", async () => {
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: DETERMINISTIC_SEED,
      networkId: "undeployed",
    });
    const api = provider.getConnection().api as unknown as MidnightLocalApi;
    const message = "hello effectstream";
    const signed = await api.signData(message, {
      encoding: "text",
      keyType: "unshielded",
    });

    const messageBytes = Buffer.from(message, "utf-8");
    const ok = verifySignature(
      { tag: "schnorr", value: signed.verifyingKey },
      messageBytes,
      { tag: "schnorr", value: signed.signature },
    );
    expect(ok).toBe(true);
    expect(signed.verifyingKey).not.toContain("[object Object]");
    expect(signed.signature).not.toContain("[object Object]");

    // signMessage on the IProvider surface returns "signature|verifyingKey"
    // (Midnight signing is non-deterministic, so the inner signature differs
    // each call). The combined form is what CryptoManager.Midnight() consumes.
    const sig = await provider.signMessage(message);
    const [innerSig, innerVk, ...rest] = sig.split("|");
    expect(rest).toEqual([]);
    expect(innerVk).toBe(signed.verifyingKey);
    const okAgain = verifySignature(
      { tag: "schnorr", value: innerVk },
      messageBytes,
      { tag: "schnorr", value: innerSig },
    );
    expect(okAgain).toBe(true);
  });

  test("facade mode: networkUrls triggers buildWalletFacade and exposes the full WalletFacade on the api", async () => {
    // Sentinel objects so we can assert the facade-path code actually wired
    // through whatever buildWalletFacade returned.
    const fakeFacade = { __kind: "WalletFacade", shielded: {}, dust: {}, unshielded: {} };
    const fakeShielded = {
      address: {
        coinPublicKeyString: () => "deadbeef-coin-pub-key",
        encryptionPublicKeyString: () => "deadbeef-enc-pub-key",
      },
      balances: {},
    };
    const buildSpy = mock(async (
      networkUrls: unknown,
      seed: string,
      _networkId: unknown,
      _syncMode: unknown,
    ) => ({
      wallet: fakeFacade,
      zswapSecretKeys: {} as never,
      walletZswapSecretKeys: {} as never,
      dustSecretKey: {} as never,
      walletDustSecretKey: {} as never,
      dustAddress: `dust-for-${seed.slice(0, 8)}`,
      unshieldedAddress: `unshielded-for-${seed.slice(0, 8)}`,
      unshieldedKeystore: {} as never,
      __echoedNetworkUrls: networkUrls,
    }));
    const getInitialSpy = mock(async (_shielded: unknown) => fakeShielded);

    mock.module("@effectstream/midnight-contracts/wallet-info", () => ({
      buildWalletFacade: buildSpy,
      getInitialShieldedState: getInitialSpy,
    }));

    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: DETERMINISTIC_SEED,
      networkId: "undeployed",
      networkUrls: {
        indexer: "http://127.0.0.1:8088/api/v3/graphql",
        indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
        node: "http://127.0.0.1:9944",
        proofServer: "http://127.0.0.1:6300",
      },
    });

    expect(buildSpy).toHaveBeenCalledTimes(1);
    const [networkUrlsArg, seedArg, networkIdArg, syncModeArg] = buildSpy.mock.calls[0]!;
    expect(seedArg).toBe(DETERMINISTIC_SEED);
    expect(networkIdArg).toBe("undeployed");
    expect(syncModeArg).toBe("all");
    expect(networkUrlsArg).toMatchObject({
      indexer: "http://127.0.0.1:8088/api/v3/graphql",
      indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
      node: "http://127.0.0.1:9944",
      proofServer: "http://127.0.0.1:6300",
      id: "undeployed",
    });

    const api = provider.getConnection().api as unknown as MidnightLocalApi;
    expect(api.walletFacade).toBe(fakeFacade);
    expect(api.dustAddress).toBe(`dust-for-${DETERMINISTIC_SEED.slice(0, 8)}`);
    expect(api.shieldedAddress).toBe("deadbeef-coin-pub-key");
    // The encryption key is surfaced alongside the coin key: anything building
    // a shielded output for this wallet needs both, and re-deriving it meant
    // reaching back into @effectstream/midnight-contracts.
    expect(api.shieldedEncryptionPublicKey).toBe("deadbeef-enc-pub-key");

    // getShieldedAddresses no longer throws in facade mode, and mirrors the
    // dapp-connector-api's shape (same field names; hex rather than bech32m).
    await expect(api.getShieldedAddresses()).resolves.toEqual({
      shieldedAddress: "deadbeef-coin-pub-key",
      shieldedCoinPublicKey: "deadbeef-coin-pub-key",
      shieldedEncryptionPublicKey: "deadbeef-enc-pub-key",
    });

    expect(provider.getConnection().metadata.displayName).toBe(
      "Midnight (local seed, facade)",
    );

    mock.restore();
  });

  test("signMessage round-trips through CryptoManager.Midnight().verifySignature", async () => {
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: DETERMINISTIC_SEED,
      networkId: "undeployed",
    });
    const message = "hello effectstream from @effectstream/crypto";
    const sig = await provider.signMessage(message);

    const midnightCrypto = CryptoManager.getCryptoManager(AddressType.MIDNIGHT);
    const ok = await midnightCrypto.verifySignature(
      provider.getAddress().address,
      message,
      sig,
    );
    expect(ok).toBe(true);

    // Tampering with the message must fail verification.
    const tampered = await midnightCrypto.verifySignature(
      provider.getAddress().address,
      `${message} tampered`,
      sig,
    );
    expect(tampered).toBe(false);
  });
});
