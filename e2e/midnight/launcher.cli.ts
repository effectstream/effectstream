import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

export default {
  processes: [
    ...launchPglite(),

    // ── Compile Midnight contracts (Compact) — app-specific per contract ─────
    { name: "compile-midnight-counter", description: "Compile counter contract with Compact", cwd: "e2e/shared/contracts/midnight/contract-counter", args: ["run", "compact"], waitToExit: true, critical: true },
    { name: "compile-midnight-eip20", description: "Compile EIP-20 contract with Compact", cwd: "e2e/shared/contracts/midnight/contract-eip-20", args: ["run", "compact"], waitToExit: true, critical: true },

    // ── Midnight infrastructure ───────────────────────────────────────────────
    ...launchMidnight("@e2e/midnight-contracts", { resolveFrom: import.meta.dirname! }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: process.env["MIDNIGHT_STORAGE_PASSWORD"] ?? "YourPasswordMy1!" },
      dependsOn: ["compile-midnight-counter", "compile-midnight-eip20"],
    }),

    // ── Sync ──────────────────────────────────────────────────────────────────
    { name: "sync", args: ["run", "e2e/midnight/node.ts"], waitToExit: false, type: "system-dependency" as const, env: { PGLITE: "true" }, dependsOn: [DbNames.PGLITE_WAIT, MidnightNames.CONTRACT_DEPLOY] },

    // ── Batcher ───────────────────────────────────────────────────────────────
    { name: "batcher", args: ["run", "e2e/midnight/batcher/main.ts"], stopProcessAtPort: [3334], waitToExit: false, dependsOn: [MidnightNames.CONTRACT_DEPLOY] },
    { name: "batcher-wait", args: ["./node_modules/.bin/wait-on", "tcp:3334"], waitToExit: true, dependsOn: ["batcher"] },
  ],
} satisfies OrchestratorConfig;
