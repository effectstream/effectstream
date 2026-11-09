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
import {
  defaultMidnightNetworkConfig,
  type MidnightNetworkConfig,
} from "../src/midnight-env.ts";
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

const BLOCKFROST_NETWORKS = ["preview", "preprod", "mainnet"] as const;
const URL_OVERRIDE_ENVS = [
  "MIDNIGHT_INDEXER_HTTP",
  "MIDNIGHT_INDEXER_WS",
  "MIDNIGHT_NODE_HTTP",
] as const;
// Every variable midnight-env.ts reads; each probe starts with all of them unset.
const MIDNIGHT_ENVS = [
  "MIDNIGHT_NETWORK_ID",
  "MIDNIGHT_BLOCKFROST_PROJECT_ID",
  ...URL_OVERRIDE_ENVS,
  "MIDNIGHT_PROOF_SERVER_URL",
  "MIDNIGHT_PROOF_SERVER",
  "MIDNIGHT_WALLET_SEED",
  "MIDNIGHT_WALLET_MNEMONIC",
] as const;

type SelectedConfigProbe = {
  config?: MidnightNetworkConfig;
  error?: string;
  networkCalls: number;
  stderr: string;
};

/**
 * Import midnight-env.ts in a fresh process with exactly `vars` set, because the
 * selected configuration resolves once at module load. Network access is
 * replaced by a counter so no case can depend on a live endpoint.
 */
async function resolveSelectedConfig(
  vars: Record<string, string>,
): Promise<SelectedConfigProbe> {
  const moduleUrl = new URL("../src/midnight-env.ts", import.meta.url).href;
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of MIDNIGHT_ENVS) delete env[name];
  Object.assign(env, vars);

  const probe = Bun.spawn([
    process.execPath,
    "--eval",
    `
      let networkCalls = 0;
      globalThis.fetch = () => {
        networkCalls += 1;
        throw new Error("unexpected network call");
      };
      try {
        const { midnightNetworkConfig } = await import(${JSON.stringify(moduleUrl)});
        console.log(JSON.stringify({ config: midnightNetworkConfig, networkCalls }));
      } catch (error) {
        console.log(JSON.stringify({ error: String(error?.message ?? error), networkCalls }));
      }
    `,
  ], { env, stdout: "pipe", stderr: "pipe" });

  const [exitCode, stdout, stderr] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  const lastLine = stdout.trim().split("\n").at(-1) ?? "";
  return { ...JSON.parse(lastLine), stderr };
}

describe("network defaults", () => {
  test("public config type accepts the complete object shape", () => {
    const config: MidnightNetworkConfig = {
      id: "undeployed",
      indexer: "http://127.0.0.1:8088/api/v4/graphql",
      indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
      node: "http://127.0.0.1:9944",
      proofServer: "http://127.0.0.1:6300",
      walletSeed: "legacy-wallet-seed",
    };

    expect(Object.keys(config).sort()).toEqual([
      "id",
      "indexer",
      "indexerWS",
      "node",
      "proofServer",
      "walletSeed",
    ]);
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

  // Hosted networks have no tokenless default any more: either the default
  // carries the Blockfrost host for that network, or resolution refuses and
  // names the token variable. A `*.midnight.network` host is never returned.
  for (const networkId of BLOCKFROST_NETWORKS) {
    test(`hosted network ID ${networkId} never defaults to a midnight.network host`, () => {
      let config: ReturnType<typeof defaultMidnightNetworkConfig>;
      try {
        config = defaultMidnightNetworkConfig(networkId);
      } catch (error) {
        expect((error as Error).message).toContain("MIDNIGHT_BLOCKFROST_PROJECT_ID");
        return;
      }
      expect(JSON.stringify(config)).not.toContain("midnight.network");
      expect(config.indexer).toStartWith(`https://midnight-${networkId}.blockfrost.io/api/v0`);
      expect(config.indexerWS).toStartWith(`wss://midnight-${networkId}.blockfrost.io/api/v0/ws`);
      expect(config.node).toStartWith(`https://rpc.midnight-${networkId}.blockfrost.io`);
      expect(config.proofServer).toBe("http://127.0.0.1:6300");
      expect(config.networkId).toBe(networkId);
    });
  }

  test("an unknown network ID gets no guessed default and names the override variables", () => {
    let message = "";
    expect(() => {
      try {
        defaultMidnightNetworkConfig("future-network");
      } catch (error) {
        message = (error as Error).message;
        throw error;
      }
    }).toThrow();
    for (const name of URL_OVERRIDE_ENVS) expect(message).toContain(name);
  });

  test("selected network environment overrides win without any network call", async () => {
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
        MIDNIGHT_NETWORK_ID: "mainnet",
        MIDNIGHT_INDEXER_HTTP: "https://override.example/indexer",
        MIDNIGHT_INDEXER_WS: "wss://override.example/indexer/ws",
        MIDNIGHT_NODE_HTTP: "wss://override.example/node",
        MIDNIGHT_PROOF_SERVER_URL: "http://override.example/proof",
        MIDNIGHT_PROOF_SERVER: "http://ignored.example/proof",
        MIDNIGHT_WALLET_SEED: "seed-override",
        MIDNIGHT_WALLET_MNEMONIC: "invalid mnemonic must remain unused",
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
    const { midnightNetworkConfig, networkCalls } = JSON.parse(stdout);
    expect({
      id: midnightNetworkConfig.id,
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      walletSeed: midnightNetworkConfig.walletSeed,
    }).toEqual({
      id: "mainnet",
      indexer: "https://override.example/indexer",
      indexerWS: "wss://override.example/indexer/ws",
      node: "wss://override.example/node",
      proofServer: "http://override.example/proof",
      walletSeed: "seed-override",
    });
    expect(networkCalls).toBe(0);
  });
});

describe("selected network endpoints", () => {
  const TOKEN = "abc";
  const LOOPBACK = {
    indexer: "http://127.0.0.1:8088/api/v4/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
    node: "http://127.0.0.1:9944",
    proofServer: "http://127.0.0.1:6300",
    walletSeed: "0000000000000000000000000000000000000000000000000000000000000001",
  };
  const SELF_HOSTED = {
    MIDNIGHT_INDEXER_HTTP: "https://indexer.example/api/v4/graphql",
    MIDNIGHT_INDEXER_WS: "wss://indexer.example/api/v4/graphql/ws",
    MIDNIGHT_NODE_HTTP: "https://node.example",
  };
  // Midnight still serves preview itself; these URLs stay usable as overrides.
  const MIDNIGHT_HOSTED_PREVIEW = {
    MIDNIGHT_INDEXER_HTTP: "https://indexer.preview.midnight.network/api/v4/graphql",
    MIDNIGHT_INDEXER_WS: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
    MIDNIGHT_NODE_HTTP: "https://rpc.preview.midnight.network",
  };
  const blockfrost = (networkId: string, token: string) => ({
    indexer: `https://midnight-${networkId}.blockfrost.io/api/v0?project_id=${token}`,
    indexerWS: `wss://midnight-${networkId}.blockfrost.io/api/v0/ws?project_id=${token}`,
    node: `https://rpc.midnight-${networkId}.blockfrost.io?project_id=${token}`,
  });
  const overridden = (urls: typeof SELF_HOSTED) => ({
    indexer: urls.MIDNIGHT_INDEXER_HTTP,
    indexerWS: urls.MIDNIGHT_INDEXER_WS,
    node: urls.MIDNIGHT_NODE_HTTP,
  });

  test("undeployed keeps the loopback profile and needs no token", async () => {
    const probe = await resolveSelectedConfig({ MIDNIGHT_NETWORK_ID: "undeployed" });
    expect(probe.error).toBeUndefined();
    expect(probe.config).toEqual({ id: "undeployed", ...LOOPBACK });
    expect(probe.networkCalls).toBe(0);
  });

  test("undeployed never attaches a Blockfrost token to loopback URLs", async () => {
    const probe = await resolveSelectedConfig({
      MIDNIGHT_NETWORK_ID: "undeployed",
      MIDNIGHT_BLOCKFROST_PROJECT_ID: TOKEN,
    });
    expect(probe.error).toBeUndefined();
    expect(probe.config).toEqual({ id: "undeployed", ...LOOPBACK });
  });

  for (const networkId of BLOCKFROST_NETWORKS) {
    test(`${networkId} with a token resolves to the Blockfrost endpoints`, async () => {
      const probe = await resolveSelectedConfig({
        MIDNIGHT_NETWORK_ID: networkId,
        MIDNIGHT_BLOCKFROST_PROJECT_ID: TOKEN,
      });
      expect(probe.error).toBeUndefined();
      expect(probe.config).toEqual({
        id: networkId,
        ...blockfrost(networkId, TOKEN),
        proofServer: "http://127.0.0.1:6300",
        walletSeed: "",
      });
      expect(probe.networkCalls).toBe(0);
    });

    test(`${networkId} without a token refuses to resolve and names the fix`, async () => {
      const probe = await resolveSelectedConfig({ MIDNIGHT_NETWORK_ID: networkId });
      expect(probe.config).toBeUndefined();
      expect(probe.error).toContain("MIDNIGHT_BLOCKFROST_PROJECT_ID");
      for (const name of URL_OVERRIDE_ENVS) expect(probe.error).toContain(name);
      expect(probe.networkCalls).toBe(0);
    });

    test(`${networkId} without a token refuses while any URL falls back to a default`, async () => {
      for (const defaulted of URL_OVERRIDE_ENVS) {
        const vars: Record<string, string> = { MIDNIGHT_NETWORK_ID: networkId, ...SELF_HOSTED };
        delete vars[defaulted];
        const probe = await resolveSelectedConfig(vars);
        expect({ defaulted, resolved: probe.config !== undefined, error: probe.error ?? "" })
          .toMatchObject({
            defaulted,
            resolved: false,
            error: expect.stringContaining("MIDNIGHT_BLOCKFROST_PROJECT_ID"),
          });
      }
    });

    test(`${networkId} without a token resolves when all three URLs are overridden`, async () => {
      const urls = networkId === "preview" ? MIDNIGHT_HOSTED_PREVIEW : SELF_HOSTED;
      const probe = await resolveSelectedConfig({ MIDNIGHT_NETWORK_ID: networkId, ...urls });
      expect(probe.error).toBeUndefined();
      expect(probe.config).toEqual({
        id: networkId,
        ...overridden(urls),
        proofServer: "http://127.0.0.1:6300",
        walletSeed: "",
      });
    });
  }

  test("explicit URL overrides are used verbatim even when a token is set", async () => {
    const probe = await resolveSelectedConfig({
      MIDNIGHT_NETWORK_ID: "mainnet",
      MIDNIGHT_BLOCKFROST_PROJECT_ID: TOKEN,
      ...SELF_HOSTED,
    });
    expect(probe.error).toBeUndefined();
    expect(probe.config).toMatchObject({ id: "mainnet", ...overridden(SELF_HOSTED) });
  });

  test("a single URL override leaves the other two on Blockfrost with the token", async () => {
    const defaults = blockfrost("preprod", TOKEN);
    const fields = {
      MIDNIGHT_INDEXER_HTTP: "indexer",
      MIDNIGHT_INDEXER_WS: "indexerWS",
      MIDNIGHT_NODE_HTTP: "node",
    } as const;
    for (const name of URL_OVERRIDE_ENVS) {
      const probe = await resolveSelectedConfig({
        MIDNIGHT_NETWORK_ID: "preprod",
        MIDNIGHT_BLOCKFROST_PROJECT_ID: TOKEN,
        [name]: SELF_HOSTED[name],
      });
      expect({ override: name, error: probe.error, config: probe.config }).toMatchObject({
        override: name,
        error: undefined,
        config: { id: "preprod", ...defaults, [fields[name]]: SELF_HOSTED[name] },
      });
    }
  });

  test("a token issued for another network is attached unchanged", async () => {
    const otherNetworkToken = "nightpreprodWrongNetwork";
    const probe = await resolveSelectedConfig({
      MIDNIGHT_NETWORK_ID: "mainnet",
      MIDNIGHT_BLOCKFROST_PROJECT_ID: otherNetworkToken,
    });
    expect(probe.error).toBeUndefined();
    expect(probe.config).toMatchObject({
      id: "mainnet",
      ...blockfrost("mainnet", otherNetworkToken),
    });
  });

  test("an unknown network ID refuses to resolve and names the override variables", async () => {
    const probe = await resolveSelectedConfig({ MIDNIGHT_NETWORK_ID: "future-network" });
    expect(probe.config).toBeUndefined();
    for (const name of URL_OVERRIDE_ENVS) expect(probe.error).toContain(name);
    expect(probe.networkCalls).toBe(0);
  });

  test("an unknown network ID never echoes the Blockfrost token", async () => {
    const secret = "nightmainnetDoNotPrintMe";
    const probe = await resolveSelectedConfig({
      MIDNIGHT_NETWORK_ID: "future-network",
      MIDNIGHT_BLOCKFROST_PROJECT_ID: secret,
    });
    expect(probe.config).toBeUndefined();
    expect(probe.error).toBeString();
    expect(probe.error).not.toContain(secret);
    expect(probe.stderr).not.toContain(secret);
  });

  test("an unknown network ID refuses while any URL override is missing", async () => {
    for (const missing of URL_OVERRIDE_ENVS) {
      const vars: Record<string, string> = {
        MIDNIGHT_NETWORK_ID: "future-network",
        ...SELF_HOSTED,
      };
      delete vars[missing];
      const probe = await resolveSelectedConfig(vars);
      expect({ missing, resolved: probe.config !== undefined, error: probe.error ?? "" })
        .toMatchObject({ missing, resolved: false, error: expect.stringContaining(missing) });
    }
  });

  test("an unknown network ID resolves from the three URL overrides alone", async () => {
    const probe = await resolveSelectedConfig({
      MIDNIGHT_NETWORK_ID: "future-network",
      ...SELF_HOSTED,
    });
    expect(probe.error).toBeUndefined();
    expect(probe.config).toMatchObject({
      id: "future-network",
      ...overridden(SELF_HOSTED),
      proofServer: "http://127.0.0.1:6300",
    });
    expect(probe.networkCalls).toBe(0);
  });
});
