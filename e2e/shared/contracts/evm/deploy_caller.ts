import { deploy } from "./deploy.ts";

// TODO This is a workaround until we can better select the working directory for the HRE/Ingition.
//
// This is a wrapper for calling `deploy`
// if the deno.tasks.deploy = `deno run -A deploy.ts` directly,
// So we call `deno run -A deploy_caller.ts` instead, that calls deploy.ts.
//
// The issue is that the working directory for the HRE/Ingition is not programatic,
// so it will be in the start script location, instead of the evm-contracts directory.
//
console.log("Deploying contracts...");
await deploy();
