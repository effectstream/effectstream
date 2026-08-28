import { describe, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "../src/mod.ts";

const buildCanonicalConfig = () =>
  new ConfigBuilder()
    .buildNetworks((builder) =>
      builder
        .addNetwork({ type: ConfigNetworkType.NTP })
        .addNetwork({
          type: ConfigNetworkType.MIDNIGHT,
          networkId: "stagenet",
        })
    )
    .buildSyncProtocols((builder) =>
      builder
        .addMain(
          (networks) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        )
        .addParallel(
          (networks) => networks.midnight,
          () => ({
            name: "midnight",
            type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
            startBlockHeight: 1,
          }),
        )
    )
    .buildPrimitives((builder) => builder)
    .build();

describe("canonical ConfigBuilder defaults", () => {
  test("materializes namespace-free NTP, Midnight, polling, and indexer defaults", () => {
    const config = buildCanonicalConfig();

    expect(config.securityNamespace).toBeUndefined();
    expect(Object.keys(config.allNetworks.networks).sort()).toEqual([
      "midnight",
      "ntp",
    ]);
    expect(config.allNetworks.networks.ntp).toMatchObject({
      name: "ntp",
      type: ConfigNetworkType.NTP,
      blockTimeMS: 1_000,
    });
    expect(config.allNetworks.networks.ntp.startTime).toBeNumber();
    expect(config.allNetworks.networks.midnight).toEqual({
      name: "midnight",
      type: ConfigNetworkType.MIDNIGHT,
      networkId: "stagenet",
    });
    expect(config.deployedAddresses).toEqual({});
    expect(config.syncProtocols.main.syncProtocol.pollingInterval).toBe(1_000);
    expect(
      config.syncProtocols.parallel.midnight.syncProtocol.pollingInterval,
    ).toBe(6_000);
    expect(config.syncProtocols.parallel.midnight.syncProtocol.indexer).toBe(
      "https://indexer.stagenet.shielded.tools/api/v4/graphql",
    );
  });

  test("samples Date.now exactly once for each omitted NTP startTime", () => {
    const originalNow = Date.now;
    let calls = 0;
    Date.now = () => {
      calls += 1;
      return 1_234_567;
    };
    try {
      const result = new ConfigBuilder().buildNetworks((builder) =>
        builder
          .addNetwork({ type: ConfigNetworkType.NTP })
          .addNetwork({
            type: ConfigNetworkType.NTP,
            name: "stable-clock",
            startTime: 42,
            blockTimeMS: 2_000,
          })
      );
      expect(result.data.allNetworks?.networks.ntp.startTime).toBe(1_234_567);
      expect(result.data.allNetworks?.networks["stable-clock"].startTime).toBe(
        42,
      );
      expect(calls).toBe(1);
    } finally {
      Date.now = originalNow;
    }
  });

  test("preserves every explicit network and protocol override", () => {
    const config = new ConfigBuilder()
      .setNamespace((builder) => builder.setSecurityNamespace("custom-app"))
      .buildNetworks((builder) =>
        builder
          .addNetwork({
            type: ConfigNetworkType.NTP,
            name: "clock",
            startTime: 7,
            blockTimeMS: 2_500,
          })
          .addNetwork({
            type: ConfigNetworkType.MIDNIGHT,
            name: "chain",
            networkId: "stagenet",
          })
      )
      .buildSyncProtocols((builder) =>
        builder
          .addMain(
            (networks) => networks.clock,
            () => ({
              name: "main",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: 10,
              pollingInterval: 123,
            }),
          )
          .addParallel(
            (networks) => networks.chain,
            () => ({
              name: "parallel",
              type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
              startBlockHeight: 20,
              pollingInterval: 456,
              indexer: "https://custom.example/graphql",
            }),
          )
      )
      .buildPrimitives((builder) => builder)
      .build();

    expect(config.securityNamespace).toBe("custom-app");
    expect(config.allNetworks.networks.clock).toMatchObject({
      name: "clock",
      startTime: 7,
      blockTimeMS: 2_500,
    });
    expect(config.syncProtocols.main.syncProtocol.pollingInterval).toBe(123);
    expect(config.syncProtocols.parallel.parallel.syncProtocol).toMatchObject({
      pollingInterval: 456,
      indexer: "https://custom.example/graphql",
    });
  });

  test("preserves an explicit historical namespace object unchanged", () => {
    const historicalNamespace = {
      read: Object.assign(
        [{ block_height: 0, prefixes: ["legacy"] }],
        { block_height: 0 as const, prefixes: ["legacy"] },
      ),
      write: "current",
    };
    const result = new ConfigBuilder()
      .setNamespace((builder) =>
        builder.setSecurityNamespace(historicalNamespace)
      )
      .buildNetworks((builder) =>
        builder.addNetwork({ type: ConfigNetworkType.NTP })
      );

    expect(result.data.securityNamespace).toBe(historicalNamespace);
  });

  test("rejects duplicate inferred names before overwriting", () => {
    expect(() =>
      new ConfigBuilder().buildNetworks((builder) =>
        builder
          .addNetwork({ type: ConfigNetworkType.NTP })
          .addNetwork({ type: ConfigNetworkType.NTP })
      )
    ).toThrow("provide explicit unique names");

    expect(() =>
      new ConfigBuilder().buildNetworks((builder) =>
        builder
          .addNetwork({
            type: ConfigNetworkType.MIDNIGHT,
            networkId: "stagenet",
          })
          .addNetwork({
            type: ConfigNetworkType.MIDNIGHT,
            networkId: "future-network",
          })
      )
    ).toThrow("provide explicit unique names");
  });

  test("omitted and explicit empty deployment stages are equivalent", () => {
    const withoutStage = buildCanonicalConfig();
    const withStage = new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({
          type: ConfigNetworkType.NTP,
          startTime: withoutStage.allNetworks.networks.ntp.startTime,
        })
      )
      .buildDeployments((builder) => builder)
      .buildSyncProtocols((builder) =>
        builder.addMain(
          (networks) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        )
      )
      .buildPrimitives((builder) => builder)
      .build();

    expect(withoutStage.deployedAddresses).toEqual({});
    expect(withStage.deployedAddresses).toEqual({});
  });

  test("preserves real deployments and supplies them to protocol callbacks", () => {
    let observedDeployment: unknown;
    const config = new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({ type: ConfigNetworkType.NTP, startTime: 1 })
      )
      .buildDeployments((builder) =>
        builder.addDeployment(
          (networks) => networks.ntp,
          () => ({ clock: "ntp://clock" }),
        )
      )
      .buildSyncProtocols((builder) =>
        builder.addMain(
          (networks) => networks.ntp,
          (_network, deployments) => {
            observedDeployment = deployments;
            return {
              name: "ntp",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: 1,
            };
          },
        )
      )
      .buildPrimitives((builder) => builder)
      .build();

    expect(observedDeployment).toEqual({ clock: "ntp://clock" });
    expect(config.deployedAddresses).toEqual({
      ntp: { clock: "ntp://clock" },
    });
  });

  test("does not apply NTP or Midnight polling defaults to other protocols", () => {
    const config = new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({
          name: "test",
          type: ConfigNetworkType.TEST,
          startTime: 0,
          blockTimeMS: 50,
        })
      )
      .buildSyncProtocols((builder) =>
        builder.addMain(
          (networks) => networks.test,
          () => ({
            name: "test-main",
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 321,
          }),
        )
      )
      .buildPrimitives((builder) => builder)
      .build();

    expect(config.syncProtocols.main.syncProtocol.pollingInterval).toBe(321);
  });

  test("uses the generic profile for arbitrary IDs and rejects impossible derivation", () => {
    const generic = new ConfigBuilder()
      .buildNetworks((builder) =>
        builder
          .addNetwork({ type: ConfigNetworkType.NTP, startTime: 1 })
          .addNetwork({
            type: ConfigNetworkType.MIDNIGHT,
            networkId: "future-network",
          })
      )
      .buildSyncProtocols((builder) =>
        builder
          .addMain(
            (networks) => networks.ntp,
            () => ({
              name: "ntp",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: 1,
            }),
          )
          .addParallel(
            (networks) => networks.midnight,
            () => ({
              name: "midnight",
              type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
              startBlockHeight: 1,
            }),
          )
      );
    expect(
      generic.data.syncProtocols?.parallel.midnight.syncProtocol.indexer,
    ).toBe(
      "https://indexer.future-network.midnight.network/api/v4/graphql",
    );

    expect(() =>
      new ConfigBuilder()
        .buildNetworks((builder) =>
          builder
            .addNetwork({ type: ConfigNetworkType.NTP, startTime: 1 })
            .addNetwork({
              type: ConfigNetworkType.MIDNIGHT,
              networkId: "",
            })
        )
        .buildSyncProtocols((builder) =>
          builder
            .addMain(
              (networks) => networks.ntp,
              () => ({
                name: "ntp",
                type: ConfigSyncProtocolType.NTP_MAIN,
                startBlockHeight: 1,
              }),
            )
            .addParallel(
              (networks) => networks.midnight,
              () => ({
                name: "midnight",
                type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
                startBlockHeight: 1,
              }),
            )
        )
    ).toThrow("non-empty networkId");
  });
});
