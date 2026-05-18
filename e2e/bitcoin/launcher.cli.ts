import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchBitcoin, BitcoinNames } from "@effectstream/orchestrator/launch-bitcoin";

export default {
  processes: [
    ...launchPglite(),
    ...launchBitcoin("@e2e/bitcoin-contracts", { resolveFrom: import.meta.dirname! }),

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E Bitcoin sync node",
      args: ["run", "e2e/bitcoin/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        BitcoinNames.BITCOIN_WAIT_FOR_BLOCK,
      ],
    },

    // ── Batcher ─────────────────────────────────────────────────────────────
    {
      name: "batcher",
      description: "E2E Bitcoin Batcher",
      stopProcessAtPort: [3334],
      args: ["run", "e2e/bitcoin/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [BitcoinNames.BITCOIN_WAIT_FOR_BLOCK],
    },
  ],
} satisfies OrchestratorConfig;
