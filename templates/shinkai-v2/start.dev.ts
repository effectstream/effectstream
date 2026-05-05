import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite().map((p) =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchEvm("@shinkai-v2/contracts-evm", { resolveFrom: root }),

    {
      name: "sync",
      description: "Shinkai sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },

    {
      name: "batcher",
      description: "Transaction batcher",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [EvmNames.GENERATE_MOD],
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
