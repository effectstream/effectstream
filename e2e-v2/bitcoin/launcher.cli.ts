import type { OrchestratorConfig } from "@effectstream/orchestrator-v2/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator-v2/launch-pglite";
import { launchBitcoin, BitcoinNames } from "@effectstream/orchestrator-v2/launch-bitcoin";

export default {
  processes: [
    ...launchPglite(),
    ...launchBitcoin("@e2e-v2/bitcoin-contracts", import.meta.dirname!),

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 Bitcoin sync node",
      args: ["run", "e2e-v2/bitcoin/node.ts"],
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
      description: "E2E-V2 Bitcoin Batcher",
      stopProcessAtPort: [3334],
      args: ["run", "e2e-v2/bitcoin/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [BitcoinNames.BITCOIN_WAIT_FOR_BLOCK],
    },
  ],
} satisfies OrchestratorConfig;
