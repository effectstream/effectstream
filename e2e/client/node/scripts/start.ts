import {
  OrchestratorConfig,
  type ProcessComponent,
  start,
} from "@paima/orchestrator";
import { ComponentNames } from "@paima/log";
import { Value } from "@sinclair/typebox/value";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { launchAvail } from "@paima/orchestrator/start-avail";
import { launchCardano } from "@paima/orchestrator/start-cardano";
import { launchEvm } from "@paima/orchestrator/start-evm";
import { launchMidnight } from "@paima/orchestrator/start-midnight";

const external_db_enabled = Deno.env.get("EXTERNAL_DB_ENABLED") === "true";
const yaci_enabled = Deno.env.get("DISABLE_LINUX_YACI") === "true"
  ? false
  : true;

const config = Value.Parse(OrchestratorConfig, {
  processes: {
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: !external_db_enabled,
    [ComponentNames.COLLECTOR]: true,
  },

  packageName: "@paima",

  // Launch my processes
  processesToLaunch: [
    launchEvm("@e2e/evm-contracts"),
    yaci_enabled ? launchCardano("@e2e/cardano-contracts") : {},
    launchMidnight("@e2e/midnight-contracts"),
    // Uncomment to enable Avail Process
    // launchAvail("@e2e/avail-contracts"),
    {
      stopProcessAtPort: [10590],
      processes: [
        {
          name: "frontend-build",
          args: ["task", "-f", "@paima/explorer", "build"],
          waitToExit: true,
        },
        {
          name: "frontend-server",
          args: ["task", "-f", "@paima/explorer", "server:start"],
          waitToExit: false,
          type: "system-dependency",
        },
      ],
    },
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
