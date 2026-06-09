import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  unshielded_erc20,
  witnesses as unshielded_erc20Witnesses,
} from "./unshielded-erc20/src/index.original.ts";
import {
  erc7683,
  witnesses as erc7683Witnesses,
} from "./erc7683/src/index.original.ts";

const configs: DeployConfig[] = [
  {
    contractName: "unshielded-erc20",
    contractFileName: "unshielded-erc20.json",
    contractClass: unshielded_erc20.Contract,
    witnesses: unshielded_erc20Witnesses,
    privateStateId: "unshielded_erc20State",
    initialPrivateState: {},
    // Native unshielded mint contract has no constructor.
    deployArgs: [],
    privateStateStoreName: "unshielded-erc20-private-state",
    extractWalletAddress: true,
  },
  {
    contractName: "erc7683",
    contractFileName: "erc7683.json",
    contractClass: erc7683.Contract,
    witnesses: erc7683Witnesses,
    privateStateId: "erc7683State",
    initialPrivateState: {},
    deployArgs: [],
    privateStateStoreName: "erc7683-private-state",
    extractWalletAddress: true,
  },
];

const start = async () => {
  for (const config of configs) {
    await deployMidnightContract(config, midnightNetworkConfig);
  }
};

start()
  .then(() => {
    console.log("Deployment successful");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("Unhandled error:", e);
    process.exit(1);
  });
