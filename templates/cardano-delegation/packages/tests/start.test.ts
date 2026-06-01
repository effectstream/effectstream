import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";

const root = path.resolve(import.meta.dirname!, "../..");

export default {
  processes: [
    ...launchPglite().map((p) =>
      p.name === "pglite"
        ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } }
        : p,
    ),
    ...launchCardano("@cardano-delegation/contracts-cardano", {
      cwd: path.join(root, "packages/contracts-cardano"),
    }).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),

    {
      name: "sync",
      description: "Cardano Delegation sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: {
        PGLITE: "true",
        MQTT_BROKER: "false",
        ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true",
      },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        CardanoNames.DOLOS_MINIBF_WAIT,
      ],
    },

    {
      name: "frontend-build",
      description: "Build frontend (test)",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
    },

    {
      name: "frontend-server",
      description: "Serve frontend (test)",
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
