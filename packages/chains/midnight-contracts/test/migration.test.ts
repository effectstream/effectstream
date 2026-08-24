import { describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import {
  ZswapChainState,
  addressFromKey,
  sampleSigningKey,
  signData,
  signatureVerifyingKey,
  verifySignature,
  type SignatureKind,
} from "@midnightntwrk/ledger-v9";
import { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import * as Rx from "rxjs";

import {
  registerNightForDust,
  resolveFacadeDustAvailableCoins,
} from "../src/get-wallet-info.ts";
import { defaultMidnightNetworkConfig } from "../src/midnight-env.ts";
import type { WalletResult } from "../src/types.ts";

describe("ledger-v9 compatibility traps", () => {
  for (const kind of ["schnorr", "ecdsa"] satisfies SignatureKind[]) {
    test(`${kind} signatures keep their tagged key and signature shapes`, () => {
      const signingKey = sampleSigningKey(kind);
      const verifyingKey = signatureVerifyingKey(signingKey);
      const payload = new TextEncoder().encode(`effectstream-${kind}`);
      const signature = signData(signingKey, payload);

      expect(signingKey.tag).toBe(kind);
      expect(verifyingKey.tag).toBe(kind);
      expect(signature.tag).toBe(kind);
      expect(signingKey.value).toMatch(/^[0-9a-f]+$/i);
      expect(verifyingKey.value).toMatch(/^[0-9a-f]+$/i);
      expect(signature.value).toMatch(/^[0-9a-f]+$/i);
      expect(verifySignature(verifyingKey, payload, signature)).toBe(true);
      expect(addressFromKey(verifyingKey)).toBeTruthy();
    });
  }

  test("postBlockUpdate accepts the required retentionDuration", () => {
    const updated = new ZswapChainState().postBlockUpdate(
      new Date("2026-08-23T00:00:00.000Z"),
      3_600n,
    );
    expect(updated).toBeInstanceOf(ZswapChainState);
  });
});

describe("wallet-v2 migration", () => {
  test("wallet node client and Polkadot share one BN constructor", () => {
    const nodeClientRoot = realpathSync(
      `${import.meta.dir}/../node_modules/@midnightntwrk/wallet-sdk-node-client`,
    );
    const nodeClientRequire = createRequire(`${nodeClientRoot}/package.json`);
    const polkadotUtilRequire = createRequire(
      nodeClientRequire.resolve("@polkadot/util/package.json"),
    );
    const NodeClientBN = nodeClientRequire("bn.js");
    const PolkadotBN = polkadotUtilRequire("bn.js");
    const blockNumber = new PolkadotBN(7);

    expect(nodeClientRequire("bn.js/package.json").version).toBe("5.2.3");
    expect(polkadotUtilRequire("bn.js/package.json").version).toBe("5.2.3");
    expect(PolkadotBN).toBe(NodeClientBN);
    expect(blockNumber).toBeInstanceOf(NodeClientBN);
    expect(blockNumber.toString()).toBe("7");
  });

  test("WalletFacade exposes the async init entry point", () => {
    expect(typeof WalletFacade.init).toBe("function");
  });

  test("DUST readiness counts spendable coins, not accrued balance", () => {
    expect(
      resolveFacadeDustAvailableCoins({
        dust: { availableCoins: [], balance: () => 99n },
      }),
    ).toBe(0);
    expect(
      resolveFacadeDustAvailableCoins({
        dust: { availableCoins: [{}], balance: () => 0n },
      }),
    ).toBe(1);
  });

  test("registration finalizes the returned UnprovenTransactionRecipe", async () => {
    const calls: string[] = [];
    const signingKey = sampleSigningKey("schnorr");
    const verifyingKey = signatureVerifyingKey(signingKey);
    const recipe = {
      type: "UNPROVEN_TRANSACTION" as const,
      transaction: {},
    };
    const complete = { isStrictlyComplete: () => true };
    const dustState = {
      progress: complete,
      availableCoins: [{}],
      balance: () => 1n,
    };
    const facadeState = {
      dust: dustState,
      unshielded: {
        progress: complete,
        availableCoins: [
          { meta: { registeredForDustGeneration: false } },
        ],
      },
    };
    const wallet = {
      state: () => Rx.of(facadeState),
      dust: { state: Rx.of(dustState) },
      estimateRegistration: async () => {
        calls.push("estimate");
        return { fee: 5n, dustGenerationEstimations: [] };
      },
      waitForGeneratedDust: async (
        _coins: readonly unknown[],
        requiredAmount: bigint,
      ) => {
        calls.push("wait-generated");
        expect(requiredAmount).toBe(5n);
      },
      registerNightUtxosForDustGeneration: async (
        _coins: readonly unknown[],
        key: unknown,
        sign: (payload: Uint8Array) => Promise<unknown>,
      ) => {
        calls.push("register");
        expect(key).toEqual(verifyingKey);
        await sign(new Uint8Array([1, 2, 3]));
        return recipe;
      },
      finalizeRecipe: async (received: unknown) => {
        calls.push("finalize");
        expect(received).toBe(recipe);
        return { finalized: true };
      },
      submitTransaction: async () => {
        calls.push("submit");
        return "tx-id";
      },
    };
    const walletResult = {
      wallet,
      unshieldedKeystore: {
        getPublicKey: () => verifyingKey,
        signDataAsync: async (payload: Uint8Array) =>
          signData(signingKey, payload),
      },
    } as unknown as WalletResult;

    expect(await registerNightForDust(walletResult)).toBe(true);
    expect(calls).toEqual([
      "estimate",
      "wait-generated",
      "register",
      "finalize",
      "submit",
    ]);
  });
});

describe("network defaults", () => {
  test("undeployed uses local GraphQL v4 endpoints", () => {
    const config = defaultMidnightNetworkConfig("undeployed");
    expect(config.indexer).toBe("http://127.0.0.1:8088/api/v4/graphql");
    expect(config.indexerWS).toBe("ws://127.0.0.1:8088/api/v4/graphql/ws");
  });

  for (const networkId of [
    "mainnet",
    "testnet",
    "devnet",
    "qanet",
    "preview",
    "preprod",
    "stagenet",
    "future-network",
  ]) {
    test(`preserves deployed network ID ${networkId}`, () => {
      const config = defaultMidnightNetworkConfig(networkId);
      expect(config.networkId).toBe(networkId);
      expect(config.indexer).toBe(
        `https://indexer.${networkId}.midnight.network/api/v4/graphql`,
      );
      expect(config.node).toBe(`https://rpc.${networkId}.midnight.network`);
    });
  }
});
