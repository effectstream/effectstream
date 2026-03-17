import { deployMidnightContract, type DeployConfig } from "@paimaexample/midnight-contracts/deploy-ledger6";
import { midnightNetworkConfig } from "@paimaexample/midnight-contracts/midnight-env";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "./contract-round-value/src/index.original.ts";

const config: DeployConfig = {
  contractName: "contract-round-value",
  contractFileName: "contract-round-value.json",
  contractClass: Counter.Contract,
  witnesses,
  privateStateId: "counterPrivateState",
  initialPrivateState: { privateCounter: 0 } as CounterPrivateState,
  privateStateStoreName: "counter-private-state",
};

deployMidnightContract(config, midnightNetworkConfig)
  .then(() => {
    console.log("Deployment successful");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("Unhandled error:", e);
    process.exit(1);
  });
