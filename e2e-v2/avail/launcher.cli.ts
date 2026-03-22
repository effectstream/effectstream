import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

export default {
  processes: [
    // ── Database ──────────────────────────────────────────────────────────────
    { name: "pglite", args: ["-e", "process.argv.splice(1, 0, '_'); await import('@effectstream/db/start-pglite')", "--port", "5432"], stopProcessAtPort: [5432], waitToExit: false, critical: true },
    { name: "pglite-wait", args: ["./node_modules/.bin/wait-on", "tcp:5432"], waitToExit: true, dependsOn: ["pglite"] },
    { name: "apply-migrations", args: ["-e", "await import('@effectstream/db/apply-migrations')"], waitToExit: true, critical: true, dependsOn: ["pglite-wait"] },
    { name: "create-user-tables", args: ["run", "e2e-v2/avail/database/create-tables.ts"], waitToExit: true, critical: true, dependsOn: ["apply-migrations"] },

    // ── Avail Dev Node ────────────────────────────────────────────────────────
    { name: "avail-node", cwd: "e2e-v2/shared/contracts/avail", stopProcessAtPort: [9955, 30334], args: ["run", "avail-node:start"], waitToExit: false, critical: true },
    { name: "avail-node-wait", cwd: "e2e-v2/shared/contracts/avail", args: ["run", "avail-node:wait"], waitToExit: true, dependsOn: ["avail-node"] },

    // ── Avail Light Client (deploy.ts creates app key + spawns light client) ─
    { name: "avail-light-client-deploy", cwd: "e2e-v2/shared/contracts/avail", stopProcessAtPort: [7007], args: ["run", "avail-light-client:deploy"], waitToExit: false, critical: true, dependsOn: ["avail-node-wait"] },
    { name: "avail-light-client-wait", cwd: "e2e-v2/shared/contracts/avail", args: ["run", "avail-light-client:wait"], waitToExit: true, dependsOn: ["avail-light-client-deploy"] },

    // ── Sync ──────────────────────────────────────────────────────────────────
    { name: "sync", args: ["run", "e2e-v2/avail/node.ts"], waitToExit: false, type: "system-dependency" as const, env: { PGLITE: "true" }, dependsOn: ["create-user-tables", "avail-light-client-wait"] },
  ],
} satisfies OrchestratorConfig;
