import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";

const root = import.meta.dirname!;

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
      name: "register-test-pool",
      description: "Register Test Pool 2 on devnet",
      cwd: path.join(root, "packages/contracts-cardano"),
      command: "bash",
      args: ["register-test-pool.sh"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [CardanoNames.YACI_DEVKIT_WAIT],
    },

    {
      name: "sync",
      description: "Cardano Delegation sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", MQTT_BROKER: "false" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
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
