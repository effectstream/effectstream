import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;
const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchCardano("@zk-cardano/contracts-cardano", { cwd: path.join(root, "packages/contracts-cardano") }),
    {
      name: "midnight-contract-compile",
      description: "Compile Compact contract (compact compile +0.33.0-rc.2)",
      cwd: path.join(root, "packages/contracts-midnight/contract-ballot"),
      args: ["run", "compact"],
      waitToExit: true,
      critical: true,
    },
    ...launchMidnight("@zk-cardano/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
      dependsOn: ["midnight-contract-compile"],
    }),

    {
      name: "sync",
      description: "Cardano-Midnight sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", MQTT_BROKER: "false" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        CardanoNames.CARDANO_SUBMIT_TX,
        CardanoNames.DOLOS_MINIBF_WAIT,
        ...midnightDeps,
      ],
    },

    {
      name: "batcher",
      description: "Transaction batcher (Midnight)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [...midnightDeps],
    },

    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [...midnightDeps],
    },

    {
      name: "frontend-server",
      description: "Serve frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "serve"],
      waitToExit: false,
      type: "system-dependency",
      critical: true,
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build"],
    },

  ],
} satisfies OrchestratorConfig;
