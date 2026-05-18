import { deployMidnightContract, type DeployConfig } from "@paimaexample/midnight-contracts/deploy";
import {
  MultiChainMultiToken,
  witnesses,
} from "./contract-eip-1155/src/index.original.ts";

const config: DeployConfig = {
  contractName: "contract-eip-1155",
  contractFileName: "contract.json",
  contractClass: MultiChainMultiToken.Contract,
  witnesses,
  privateStateId: "multiChainMultiTokenPrivateState",
  initialPrivateState: {},
  deployArgs: [
    "https://api.yourproject.com/token/{id}.json",
    // initialOwner will be extracted from wallet address
    null as any, // placeholder, will be replaced
  ],
  privateStateStoreName: "multichain_multitoken-private-state",
  extractWalletAddress: true, // Extract wallet address and replace last arg with initialOwner
};

deployMidnightContract(config)
  .then(() => {
    console.log("Deployment successful");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("Unhandled error:", e);
    process.exit(1);
  });
