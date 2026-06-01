import {
  deployMidnightContract,
  type DeployConfig,
} from "@effectstream/midnight-contracts/deploy";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  OfferFilesContract,
  type OfferFilesPrivateState,
  witnesses,
} from "./contract-offer-files/src/index.ts";
import { exit } from "@effectstream/utils/runtime";

const config: DeployConfig = {
  contractName: "contract-offer-files",
  contractFileName: "contract-offer-files.json",
  contractClass: OfferFilesContract.Contract,
  witnesses,
  privateStateId: "offerFilesPrivateState",
  initialPrivateState: {} as OfferFilesPrivateState,
  privateStateStoreName: "offer-files-private-state",
  deployArgs: [],
};

console.log("Deploying contract with network config:", midnightNetworkConfig);

deployMidnightContract(config, midnightNetworkConfig)
  .then(() => {
    console.log("Deployment successful");
    exit(0);
  })
  .catch((e: unknown) => {
    console.error("Deployment failed:", e);
    exit(1);
  });
