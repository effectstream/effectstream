import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  Ballot,
  type BallotPrivateState,
  createWitnesses,
} from "./contract-ballot/src/index.ts";

const DEPLOYER_SECRET_KEY = new Uint8Array(32);
DEPLOYER_SECRET_KEY[31] = 0x01;

const config: DeployConfig = {
  contractName: "contract-ballot",
  contractFileName: "contract-ballot.json",
  contractClass: Ballot.Contract,
  witnesses: createWitnesses(DEPLOYER_SECRET_KEY),
  privateStateId: "ballotPrivateState",
  initialPrivateState: { secretKey: DEPLOYER_SECRET_KEY } as BallotPrivateState,
  privateStateStoreName: "ballot-private-state",
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
