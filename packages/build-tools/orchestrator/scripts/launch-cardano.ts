import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir, type ResolveLocation } from "./resolve-package.ts";

const waitHttpScript = new URL("./wait-http.ts", import.meta.url).pathname;

export const CardanoNames = {
  YACI_DEVKIT: "yaci-devkit",
  YACI_DEVKIT_WAIT: "yaci-devkit-wait",
  DOLOS_FILL_TEMPLATE: "dolos-fill-template",
  DOLOS: "dolos",
  DOLOS_WAIT: "dolos-wait",
  DOLOS_MINIBF_WAIT: "dolos-minibf-wait",
  CARDANO_SUBMIT_TX: "cardano-submit-tx",
} as const;

const REQUIRED_SCRIPTS = {
  "devkit:start": "Start YACI DevKit (Cardano local devnet)",
  "devkit:wait": "Wait for YACI DevKit to be ready",
  "dolos:fill-template": "Generate Dolos config from YACI DevKit state",
  "dolos:start": "Start Dolos relay node",
  "dolos:wait": "Wait for Dolos gRPC to be ready",
  "cardano-submit-tx": "Submit test transactions to the devnet",
} as const;

export function launchCardano(
  packageName: string,
  location: ResolveLocation,
  opts?: { ports?: number[] },
): ProcessConfig[] {
  const cwd = resolvePackageDir("launchCardano", packageName, location, REQUIRED_SCRIPTS);
  const ports = opts?.ports ?? [
    8090,  // CARDANO_SUBMIT_TX: cardano-submit-api
    10000, // YACI_DEVKIT: admin port
    3001,  // YACI_DEVKIT: cardano-node
    3000,  // DOLOS: minibf (blockfrost API)
    50051, // DOLOS: gRPC
  ];

  return [
    {
      stopProcessAtPort: ports,
      name: CardanoNames.YACI_DEVKIT,
      description: `Start YACI DevKit (${packageName} devkit:start)`,
      cwd,
      args: ["run", "devkit:start"],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: CardanoNames.YACI_DEVKIT_WAIT,
      description: `Wait for YACI DevKit (${packageName} devkit:wait)`,
      cwd,
      args: ["run", "devkit:wait"],
      waitToExit: true,
      dependsOn: [CardanoNames.YACI_DEVKIT],
    },
    {
      name: CardanoNames.DOLOS_FILL_TEMPLATE,
      description: `Generate Dolos config (${packageName} dolos:fill-template)`,
      cwd,
      args: ["run", "dolos:fill-template"],
      waitToExit: true,
      dependsOn: [CardanoNames.YACI_DEVKIT_WAIT],
    },
    {
      name: CardanoNames.DOLOS,
      description: `Start Dolos relay node (${packageName} dolos:start)`,
      cwd,
      args: ["run", "dolos:start"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [CardanoNames.DOLOS_FILL_TEMPLATE],
    },
    {
      name: CardanoNames.DOLOS_WAIT,
      description: `Wait for Dolos gRPC (${packageName} dolos:wait)`,
      cwd,
      args: ["run", "dolos:wait"],
      waitToExit: true,
      dependsOn: [CardanoNames.DOLOS],
    },
    {
      name: CardanoNames.DOLOS_MINIBF_WAIT,
      description: "Wait for Dolos blockfrost API on port 3000",
      args: [waitHttpScript, "--timeout", "60000", "http://localhost:3000/blocks/latest"],
      waitToExit: true,
      dependsOn: [CardanoNames.DOLOS_WAIT],
    },
    {
      name: CardanoNames.CARDANO_SUBMIT_TX,
      description: `Submit test transactions (${packageName} cardano-submit-tx)`,
      cwd,
      args: ["run", "cardano-submit-tx"],
      waitToExit: true,
      critical: true,
      dependsOn: [CardanoNames.YACI_DEVKIT_WAIT, CardanoNames.DOLOS_MINIBF_WAIT],
    },
  ];
}
