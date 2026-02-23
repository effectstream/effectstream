import {
  deployMidnightContract,
  type DeployConfig,
} from "@paimaexample/midnight-contracts";
import { midnightNetworkConfig } from "@paimaexample/midnight-contracts";
import {
  OfferFilesContract,
  type OfferFilesPrivateState,
  witnesses,
} from "./contract-offer-files/src/index.ts";

// The offer-files contract constructor takes a `color: Bytes<32>` argument
// that sets the initial token color / domain separator.
const DOMAIN_SEPARATOR = new Uint8Array(32).fill(1);

const config: DeployConfig = {
  contractName: "contract-offer-files",
  contractFileName: "contract-offer-files.json",
  contractClass: OfferFilesContract.Contract,
  witnesses,
  privateStateId: "offerFilesPrivateState",
  initialPrivateState: {} as OfferFilesPrivateState,
  privateStateStoreName: "offer-files-private-state",
  deployArgs: [DOMAIN_SEPARATOR],
};

deployMidnightContract(config, midnightNetworkConfig)
  .then(() => {
    console.log("Deployment successful");
    Deno.exit(0);
  })
  .catch((e: unknown) => {
    console.error("Deployment failed:", e);
    Deno.exit(1);
  });
