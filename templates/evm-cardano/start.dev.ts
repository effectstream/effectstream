import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite().map((p) =>
      p.name === "pglite"
        ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } }
        : p,
    ),
    ...launchEvm("@evm-cardano/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    ...launchCardano("@evm-cardano/contracts-cardano", {
      cwd: path.join(root, "packages/contracts-cardano"),
    }).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),

    {
      name: "sync",
      description: "EVM-Cardano sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", MQTT_BROKER: "false" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        EvmNames.GENERATE_MOD,
        CardanoNames.DOLOS_MINIBF_WAIT,
      ],
    },

    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [EvmNames.GENERATE_MOD],
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
