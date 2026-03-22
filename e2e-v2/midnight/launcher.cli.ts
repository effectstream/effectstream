import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

export default {
  processes: [
    // ── Database ──────────────────────────────────────────────────────────────
    { name: "pglite", args: ["-e", "process.argv.splice(1, 0, '_'); await import('@effectstream/db/start-pglite')", "--port", "5432"], stopProcessAtPort: [5432], waitToExit: false, critical: true },
    { name: "pglite-wait", args: ["./node_modules/.bin/wait-on", "tcp:5432"], waitToExit: true, dependsOn: ["pglite"] },
    { name: "apply-migrations", args: ["-e", "await import('@effectstream/db/apply-migrations')"], waitToExit: true, critical: true, dependsOn: ["pglite-wait"] },
    { name: "create-user-tables", args: ["run", "e2e-v2/midnight/database/create-tables.ts"], waitToExit: true, critical: true, dependsOn: ["apply-migrations"] },

    // ── Midnight infrastructure ───────────────────────────────────────────────
    { name: "midnight-node", cwd: "e2e-v2/shared/contracts/midnight", stopProcessAtPort: [9944, 30333], args: ["run", "midnight-node:start"], waitToExit: false, critical: true },
    { name: "midnight-indexer", cwd: "e2e-v2/shared/contracts/midnight", stopProcessAtPort: [8088], args: ["run", "midnight-indexer:start"], waitToExit: false, critical: true, dependsOn: ["midnight-node"] },
    { name: "midnight-proof-server", cwd: "e2e-v2/shared/contracts/midnight", stopProcessAtPort: [6300], args: ["run", "midnight-proof-server:start"], waitToExit: false, critical: true, dependsOn: ["midnight-node"] },
    { name: "midnight-node-wait", cwd: "e2e-v2/shared/contracts/midnight", args: ["run", "midnight-node:wait"], waitToExit: true, dependsOn: ["midnight-node"] },
    { name: "midnight-indexer-wait", cwd: "e2e-v2/shared/contracts/midnight", args: ["run", "midnight-indexer:wait"], waitToExit: true, dependsOn: ["midnight-indexer"] },
    { name: "midnight-proof-server-wait", cwd: "e2e-v2/shared/contracts/midnight", args: ["run", "midnight-proof-server:wait"], waitToExit: true, dependsOn: ["midnight-proof-server"] },
    { name: "midnight-contract", cwd: "e2e-v2/shared/contracts/midnight", args: ["run", "midnight-contract:deploy"], waitToExit: true, env: { MIDNIGHT_STORAGE_PASSWORD: process.env["MIDNIGHT_STORAGE_PASSWORD"] ?? "YourPasswordMy1!" }, dependsOn: ["midnight-node-wait", "midnight-indexer-wait", "midnight-proof-server-wait"] },

    // ── Sync ──────────────────────────────────────────────────────────────────
    { name: "sync", args: ["run", "e2e-v2/midnight/node.ts"], waitToExit: false, type: "system-dependency" as const, env: { PGLITE: "true" }, dependsOn: ["create-user-tables", "midnight-contract"] },
  ],
} satisfies OrchestratorConfig;
