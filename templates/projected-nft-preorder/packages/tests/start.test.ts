import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";

const root = path.resolve(import.meta.dirname!, "../..");

export default {
  processes: [
    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchCardano("@projected-nft-preorder/contracts-cardano", {
      cwd: path.join(root, "packages/contracts-cardano"),
    }).map(p =>
      p.name === CardanoNames.CARDANO_SUBMIT_TX
        ? {
            ...p,
            env: { ...p.env, RUN_LIFECYCLE_TEST: "1" },
            dependsOn: [...(p.dependsOn ?? []), CardanoNames.DOLOS_MINIBF_WAIT],
          }
        : p
    ),

    {
      name: "sync",
      description: "Projected NFT sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      cwd: root,
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", MQTT_BROKER: "false" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        CardanoNames.CARDANO_SUBMIT_TX,
        CardanoNames.DOLOS_MINIBF_WAIT,
      ],
    },

    {
      name: "frontend-build",
      description: "Build frontend (test)",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency" as const,
      critical: true,
      dependsOn: [CardanoNames.CARDANO_SUBMIT_TX],
    },

    {
      name: "frontend-server",
      description: "Serve frontend (test)",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "server:start"],
      waitToExit: false,
      type: "system-dependency" as const,
      critical: true,
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build"],
    },
  ],
} satisfies OrchestratorConfig;
