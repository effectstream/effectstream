import { deployMidnightContract, type DeployConfig } from "@effectstream/midnight-contracts/deploy";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  SimpleToken,
  witnesses,
} from "./contract-eip-20/src/index.original.ts";

const config: DeployConfig = {
  contractName: "contract-eip-20",
  contractFileName: "contract-eip-20.json",
  contractClass: SimpleToken.Contract,
  witnesses,
  // Must match interact + batcher adapter privateStateId
  privateStateId: "simpleTokenPrivateState",
  initialPrivateState: {},
  deployArgs: [
    "TokenName",
    "TKN",
    8n,
    // initialOwner will be extracted from wallet address
    null as any, // placeholder, will be replaced
  ],
  privateStateStoreName: "simpletoken-private-state",
  extractWalletAddress: true, // Extract wallet address and replace last arg with initialOwner
};


console.log("Deploying contract with network config:", midnightNetworkConfig);

deployMidnightContract(config, midnightNetworkConfig)
  .then(() => {
    console.log("Deployment successful");
    Deno.exit(0);
  })
  .catch((e) => {
    console.error("Unhandled error:", e);
    Deno.exit(1);
  });
