import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchEvm("@preorder/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    ...launchCardano("@preorder/contracts-cardano", { cwd: path.join(root, "packages/contracts-cardano") }),

    {
      // Apply the Aiken validator params + compute the receipt minting-policy id. Must run before
      // sync starts (the config predicate + STM read temp/receipt-policy-id.txt).
      name: "cardano-validator",
      description: "Apply Aiken validator params + compute receipt policy id",
      cwd: path.join(root, "packages/contracts-cardano"),
      args: ["run", "build-validator.ts"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [],
    },

    {
      name: "sync",
      description: "Preorder sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        EvmNames.GENERATE_MOD,
        "cardano-validator",
        // The sync node opens a UTxORPC gRPC connection to Dolos (:50051) at startup for the
        // Cardano receipt primitive — gate on Dolos being ready or it crashes with ECONNREFUSED.
        CardanoNames.DOLOS_MINIBF_WAIT,
      ],
    },

    {
      // Seed the initial campaign via an EffectstreamL2 admin input (deterministic config write).
      // Needs the contracts deployed (GENERATE_MOD); the sync node ingests the event from block 0.
      name: "seed-campaign",
      description: "Submit initial create-campaign EffectstreamL2 input",
      args: ["run", "packages/node/seed-campaign.ts"],
      waitToExit: true,
      type: "system-dependency",
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
