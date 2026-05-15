// Examples for the README — verifies that the builder API surface in the
// README compiles and runs.

import { test, expect } from "bun:test";
import { ConfigBuilder, ConfigNetworkType } from "../src/mod.ts";
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
