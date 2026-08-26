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
  resolveFacadeDustFundsReadiness,
  waitForDustFunds,
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

  test("DUST readiness carries available coins when aggregate balance is zero", async () => {
    const complete = { isStrictlyComplete: () => true };
    const dustState = {
      progress: complete,
      availableCoins: [{ generatedNow: 10n }],
      balance: () => 0n,
    };
    const wallet = { dust: { state: Rx.of(dustState) } } as unknown as WalletFacade;

    const funds = await waitForDustFunds(wallet, {
      timeoutMs: 100,
      waitNonZero: true,
      skipCatchUp: true,
      dustPollIntervalMs: 0,
    });

    expect(funds).toEqual({
      balance: 0n,
      availableCoins: 1,
      spendableCoins: 1,
      ready: true,
    });
    expect(resolveFacadeDustFundsReadiness(dustState, 11n).ready).toBe(false);
    expect(resolveFacadeDustFundsReadiness(dustState, 10n).ready).toBe(true);
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
  test("stagenet uses the complete explicit Shielded Tools profile", () => {
    expect(defaultMidnightNetworkConfig("stagenet")).toEqual({
      indexer: "https://indexer.stagenet.shielded.tools/api/v4/graphql",
      indexerWS: "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
      node: "wss://rpc.stagenet.shielded.tools",
      proofServer: "http://127.0.0.1:6300",
      faucetUrl: "https://faucet.stagenet.shielded.tools/api/drips",
      networkId: "stagenet",
      genesisWalletSeed: "",
    });
  });

  test("undeployed retains the complete loopback v4 profile", () => {
    expect(defaultMidnightNetworkConfig("undeployed")).toEqual({
      indexer: "http://127.0.0.1:8088/api/v4/graphql",
      indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
      node: "http://127.0.0.1:9944",
      proofServer: "http://127.0.0.1:6300",
      networkId: "undeployed",
      genesisWalletSeed: "0000000000000000000000000000000000000000000000000000000000000001",
    });
  });

  for (const networkId of ["preview", "preprod"] as const) {
    test(`preserves node-1.x network ID ${networkId} without remapping`, () => {
      expect(defaultMidnightNetworkConfig(networkId)).toEqual({
        indexer: `https://indexer.${networkId}.midnight.network/api/v4/graphql`,
        indexerWS: `wss://indexer.${networkId}.midnight.network/api/v4/graphql/ws`,
        node: `https://rpc.${networkId}.midnight.network`,
        proofServer: "http://127.0.0.1:6300",
        networkId,
        genesisWalletSeed: "",
      });
    });
  }

  test("preserves an arbitrary future network ID and hosted convention", () => {
    expect(defaultMidnightNetworkConfig("future-network")).toEqual({
      indexer: "https://indexer.future-network.midnight.network/api/v4/graphql",
      indexerWS: "wss://indexer.future-network.midnight.network/api/v4/graphql/ws",
      node: "https://rpc.future-network.midnight.network",
      proofServer: "http://127.0.0.1:6300",
      networkId: "future-network",
      genesisWalletSeed: "",
    });
  });

  test("selected stagenet config passes through faucet metadata without network traffic", async () => {
    const moduleUrl = new URL("../src/midnight-env.ts", import.meta.url).href;
    const probe = Bun.spawn([
      process.execPath,
      "--eval",
      `
        let networkCalls = 0;
        globalThis.fetch = () => {
          networkCalls += 1;
          throw new Error("unexpected network call");
        };
        const { midnightNetworkConfig } = await import(${JSON.stringify(moduleUrl)});
        console.log(JSON.stringify({ midnightNetworkConfig, networkCalls }));
      `,
    ], {
      env: {
        ...process.env,
        MIDNIGHT_NETWORK_ID: "stagenet",
        MIDNIGHT_INDEXER_HTTP: "",
        MIDNIGHT_INDEXER_WS: "",
        MIDNIGHT_NODE_HTTP: "",
        MIDNIGHT_PROOF_SERVER_URL: "",
        MIDNIGHT_PROOF_SERVER: "",
        MIDNIGHT_WALLET_SEED: "",
        MIDNIGHT_WALLET_MNEMONIC: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      midnightNetworkConfig: {
        id: "stagenet",
        indexer: "https://indexer.stagenet.shielded.tools/api/v4/graphql",
        indexerWS: "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
        node: "wss://rpc.stagenet.shielded.tools",
        proofServer: "http://127.0.0.1:6300",
        faucetUrl: "https://faucet.stagenet.shielded.tools/api/drips",
        walletSeed: "",
      },
      networkCalls: 0,
    });
  });

  test("faucet metadata has no production caller", async () => {
    const sourceRoot = new URL("../src/", import.meta.url).pathname;
    const mentions: string[] = [];
    for await (const file of new Bun.Glob("**/*.ts").scan({
      cwd: sourceRoot,
      onlyFiles: true,
    })) {
      if ((await Bun.file(`${sourceRoot}${file}`).text()).includes("faucetUrl")) {
        mentions.push(file);
      }
    }
    expect(mentions.sort()).toEqual(["midnight-env.ts"]);
  });
});
