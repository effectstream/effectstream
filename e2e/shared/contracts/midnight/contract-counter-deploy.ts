import { deployMidnightContract, type DeployConfig } from "@effectstream/midnight-contracts/deploy-ledger6";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "./contract-counter/src/index.ts";

const config: DeployConfig = {
  contractName: "contract-counter",
  contractFileName: "contract-counter.json",
  contractClass: Counter.Contract,
  witnesses,
  privateStateId: "counterPrivateState",
  initialPrivateState: { privateCounter: 0 } as CounterPrivateState,
  privateStateStoreName: "counter-private-state",
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
