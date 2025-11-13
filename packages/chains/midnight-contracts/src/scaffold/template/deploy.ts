import { deployMidnightContract, type DeployConfig } from "@paimaexample/midnight-contracts/deploy";

/** MIDNIGHT-DEPLOY-IMPORTS */

const configs: DeployConfig[] = [
  /** MIDNIGHT-DEPLOY-CONFIG */ 
];

const start = async () => {
  for (const config of configs) {
    await deployMidnightContract(config);
  }
}

start()
  .then(() => {
    console.log("Deployment successful");
    Deno.exit(0);
  }).catch((e: unknown) => {
    console.error("Unhandled error:", e);
    Deno.exit(1);
  });