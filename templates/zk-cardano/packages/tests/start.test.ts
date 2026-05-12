import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = path.resolve(import.meta.dirname!, "../..");
const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchCardano("@zk-cardano/contracts-cardano", { cwd: path.join(root, "packages/contracts-cardano") }),
    ...launchMidnight("@zk-cardano/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
    }),

    {
      name: "sync",
      description: "ZK Cardano sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      cwd: root,
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
      description: "Transaction batcher (Midnight) (test)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      cwd: root,
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [...midnightDeps],
    },
  ],
} satisfies OrchestratorConfig;
