import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir, type ResolveLocation } from "./resolve-package.ts";

export const AvailNames = {
  NODE: "avail-node",
  NODE_WAIT: "avail-node-wait",
  LIGHT_CLIENT_DEPLOY: "avail-light-client-deploy",
  LIGHT_CLIENT_WAIT: "avail-light-client-wait",
} as const;

const REQUIRED_SCRIPTS = {
  "avail-node:start": "Start the Avail dev node",
  "avail-node:wait": "Wait for the Avail node RPC to be ready",
  "avail-light-client:deploy": "Create app key and start the Avail light client",
  "avail-light-client:wait": "Wait for the Avail light client to be ready",
} as const;

export function launchAvail(
  packageName: string,
  location: ResolveLocation,
  opts?: { nodePorts?: number[]; clientPorts?: number[] },
): ProcessConfig[] {
  const cwd = resolvePackageDir("launchAvail", packageName, location, REQUIRED_SCRIPTS);
  const nodePorts = opts?.nodePorts ?? [9955, 30334];
  const clientPorts = opts?.clientPorts ?? [7007];

  return [
    {
      name: AvailNames.NODE,
      description: `Start Avail dev node (${packageName} avail-node:start)`,
      cwd,
      stopProcessAtPort: nodePorts,
      args: ["run", "avail-node:start"],
      waitToExit: false,
      critical: true,
    },
    {
      name: AvailNames.NODE_WAIT,
      description: `Wait for Avail node (${packageName} avail-node:wait)`,
      cwd,
      args: ["run", "avail-node:wait"],
      waitToExit: true,
      dependsOn: [AvailNames.NODE],
    },
    {
      name: AvailNames.LIGHT_CLIENT_DEPLOY,
      description: `Deploy Avail light client (${packageName} avail-light-client:deploy)`,
      cwd,
      stopProcessAtPort: clientPorts,
      args: ["run", "avail-light-client:deploy"],
      waitToExit: false,
      critical: true,
      dependsOn: [AvailNames.NODE_WAIT],
    },
    {
      name: AvailNames.LIGHT_CLIENT_WAIT,
      description: `Wait for Avail light client (${packageName} avail-light-client:wait)`,
      cwd,
      args: ["run", "avail-light-client:wait"],
      waitToExit: true,
      dependsOn: [AvailNames.LIGHT_CLIENT_DEPLOY],
    },
  ];
}
