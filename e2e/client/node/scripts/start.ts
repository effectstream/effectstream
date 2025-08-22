import {
  OrchestratorConfig,
  type ProcessComponent,
  start,
} from "@paima/orchestrator";
import { ComponentNames } from "@paima/log";
import { Value } from "@sinclair/typebox/value";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { launchAvail } from "./launch-avail.ts";
import { launchCardano } from "./launch-cardano.ts";
import { launchEvm } from "./launch-evm.ts";
import { launchMidnight } from "./launch-midnight.ts";

const yaci_enabled = Deno.env.get("DISABLE_LINUX_YACI") === "true"
  ? false
  : true;

const config = Value.Parse(OrchestratorConfig, {
  processes: {
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  packageName: "@paima",

  // Launch my processes
  processesToLaunch: [
    launchEvm,
    yaci_enabled ? launchCardano : {},
    launchMidnight,
    // Uncomment to enable Avail Process
    // launchAvail
  ],

  // Launch the Batcher with our PaimaL2 Contract
  batcher: {
    paimaL2Address: contractAddressesEvmMain()["chain31337"][
      "PaimaL2ContractModule#MyPaimaL2Contract"
    ],
    batcherPrivateKey:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    chainName: "hardhat",
  },
});

await start(config);
