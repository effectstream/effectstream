import { deployMidnightContract, type DeployConfig } from "@paimaexample/midnight-contracts/deploy";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "./contract-round-value/src/index.original.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const currentDir = path.dirname(path.fromFileUrl(import.meta.url));

const config: DeployConfig = {
  contractName: "contract-round-value",
  contractFileName: "contract.json",
  contractClass: Counter.Contract,
  witnesses,
  privateStateId: "counterPrivateState",
  initialPrivateState: { privateCounter: 0 } as CounterPrivateState,
  privateStateStoreName: "counter-private-state",
  logDir: path.resolve(
    currentDir,
    "counter-cli",
    "logs",
    "standalone",
    `${new Date().toISOString()}.log`,
  ),
};

deployMidnightContract(config)
  .then(() => {
    console.log("Deployment successful");
    Deno.exit(0);
  })
  .catch((e: unknown) => {
    console.error("Unhandled error:", e);
    Deno.exit(1);
  });
