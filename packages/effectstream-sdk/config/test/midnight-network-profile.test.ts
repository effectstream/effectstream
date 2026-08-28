import { describe, expect, test } from "bun:test";
import { resolveMidnightNetworkProfile } from "../src/mod.ts";

describe("Midnight network profiles", () => {
  test("resolves the exact Stagenet node-2.x service metadata", () => {
    expect(resolveMidnightNetworkProfile("stagenet")).toEqual({
      networkId: "stagenet",
      nodeUrl: "wss://rpc.stagenet.shielded.tools",
      indexerHttpUrl:
        "https://indexer.stagenet.shielded.tools/api/v4/graphql",
      indexerWsUrl:
        "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
      faucetUrl: "https://faucet.stagenet.shielded.tools/api/drips",
    });
  });

  test("preserves the undeployed loopback v4 profile", () => {
    expect(resolveMidnightNetworkProfile("undeployed")).toEqual({
      networkId: "undeployed",
      nodeUrl: "http://127.0.0.1:9944",
      indexerHttpUrl: "http://127.0.0.1:8088/api/v4/graphql",
      indexerWsUrl: "ws://127.0.0.1:8088/api/v4/graphql/ws",
    });
  });

  test("preserves arbitrary deployed IDs and the hosted convention", () => {
    expect(resolveMidnightNetworkProfile("future-network")).toEqual({
      networkId: "future-network",
      nodeUrl: "https://rpc.future-network.midnight.network",
      indexerHttpUrl:
        "https://indexer.future-network.midnight.network/api/v4/graphql",
      indexerWsUrl:
        "wss://indexer.future-network.midnight.network/api/v4/graphql/ws",
    });
  });

  test("rejects an ID that cannot produce a profile", () => {
    expect(() => resolveMidnightNetworkProfile("   ")).toThrow(
      "non-empty networkId",
    );
  });

  test("is pure and performs no endpoint traffic", () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      calls += 1;
      throw new Error("unexpected network call");
    };
    try {
      resolveMidnightNetworkProfile("stagenet");
      resolveMidnightNetworkProfile("preview");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps each endpoint literal in the config-owned profile only", async () => {
    const productionFiles = [
      ...await Array.fromAsync(
        new Bun.Glob("**/*.ts").scan({
          cwd: new URL("../src/", import.meta.url).pathname,
          absolute: true,
          onlyFiles: true,
        }),
      ),
      new URL(
        "../../../chains/midnight-contracts/src/midnight-env.ts",
        import.meta.url,
      ).pathname,
    ];
    const productionSource = (
      await Promise.all(productionFiles.map((file) => Bun.file(file).text()))
    ).join("\n");

    for (const endpoint of [
      "wss://rpc.stagenet.shielded.tools",
      "https://indexer.stagenet.shielded.tools/api/v4/graphql",
      "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
      "https://faucet.stagenet.shielded.tools/api/drips",
    ]) {
      expect(productionSource.split(endpoint)).toHaveLength(2);
    }
  });
});
