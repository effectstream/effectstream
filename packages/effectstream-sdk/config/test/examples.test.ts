// Examples for the README — verifies that the builder API surface in the
// README compiles and runs.

import { test, expect } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "../src/mod.ts";
import { hardhat } from "viem/chains";

test("README: ConfigBuilder.setNamespace().buildNetworks() runs without throwing", () => {
  const config = new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("my-app"))
    .buildNetworks((b) =>
      b.addNetwork({
        name: "local-evm",
        type: ConfigNetworkType.EVM,
        ...hardhat,
      })
    );

  expect(config.data.securityNamespace).toBe("my-app");
  expect(config.data.allNetworks).toBeDefined();
});

test("README: ConfigNetworkType enum exposes the expected variants", () => {
  expect(typeof ConfigNetworkType.EVM).not.toBe("undefined");
});

test("README: getting-started defaults build without namespace or deployments", () => {
  const config = new ConfigBuilder()
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
    );

  expect(config.data.allNetworks?.networks.ntp.name).toBe("ntp");
  expect(config.data.allNetworks?.networks.midnight.name).toBe("midnight");
  expect(config.data.deployedAddresses).toEqual({});
});
