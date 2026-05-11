import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchCardano } from "@effectstream/orchestrator/launch-cardano";

const root = path.resolve(import.meta.dirname!, "../..");

export default {
  processes: [
    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchEvm("@preorder/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    ...launchCardano("@preorder/contracts-cardano", { cwd: path.join(root, "packages/contracts-cardano") }),

    {
      name: "sync",
      description: "Preorder sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      cwd: root,
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        EvmNames.GENERATE_MOD,
      ],
    },

    {
      name: "frontend-dev",
      description: "Vite dev server for E2E tests",
      args: ["x", "vite", "--port", "10598", "--mode", "dev"],
      cwd: path.join(root, "packages/frontend"),
      waitToExit: false,
      type: "secondary",
      critical: false,
      stopProcessAtPort: [10598],
      dependsOn: ["sync"],
    },
  ],
} satisfies OrchestratorConfig;
