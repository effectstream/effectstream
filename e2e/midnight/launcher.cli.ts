import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";
import path from "node:path";

const EXTERNAL_INFRA = process.env["MIDNIGHT_EXTERNAL_INFRA"] === "true";
const CONTRACTS_CWD = path.resolve(import.meta.dirname!, "../shared/contracts/midnight");
const STORAGE_PASSWORD = process.env["MIDNIGHT_STORAGE_PASSWORD"] ?? "YourPasswordMy1!";
const COMPILE_PROCESSES = [
  { name: "compile-midnight-counter", description: "Compile counter contract with Compact", cwd: "e2e/shared/contracts/midnight/contract-counter", args: ["run", "compact"], waitToExit: true, critical: true },
  { name: "compile-midnight-eip20", description: "Compile EIP-20 contract with Compact", cwd: "e2e/shared/contracts/midnight/contract-eip-20", args: ["run", "compact"], waitToExit: true, critical: true },
] as const;

function requiredExternalEndpoint(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when MIDNIGHT_EXTERNAL_INFRA=true`);
  return value;
}

function waitOnTcp(endpoint: string): string {
  const url = new URL(endpoint);
  if (!url.port) throw new Error(`External Midnight endpoint must include a port: ${endpoint}`);
  return `tcp:${url.hostname}:${url.port}`;
}

function externalMidnightProcesses(): OrchestratorConfig["processes"] {
  const node = requiredExternalEndpoint("MIDNIGHT_NODE_HTTP");
  const indexer = requiredExternalEndpoint("MIDNIGHT_INDEXER_HTTP");
  const proofServer = requiredExternalEndpoint("MIDNIGHT_PROOF_SERVER_URL");
  const waitOn = path.resolve("node_modules/.bin/wait-on");
  const waitProcess = (name: string, endpoint: string, description: string) => ({
    name,
    description,
    args: [waitOn, waitOnTcp(endpoint)],
    waitToExit: true,
    critical: true,
  });

  return [
    waitProcess(MidnightNames.NODE_WAIT, node, `Wait for external Midnight node at ${node}`),
    waitProcess(MidnightNames.INDEXER_WAIT, indexer, `Wait for external Midnight indexer at ${indexer}`),
    waitProcess(MidnightNames.PROOF_SERVER_WAIT, proofServer, `Wait for external Midnight proof server at ${proofServer}`),
    {
      name: MidnightNames.CONTRACT_DEPLOY,
      description: "Deploy Midnight contracts against external infrastructure",
      cwd: CONTRACTS_CWD,
      args: ["run", "midnight-contract:deploy"],
      env: { MIDNIGHT_STORAGE_PASSWORD: STORAGE_PASSWORD },
      waitToExit: true,
      critical: true,
      dependsOn: [
        MidnightNames.NODE_WAIT,
        MidnightNames.INDEXER_WAIT,
        MidnightNames.PROOF_SERVER_WAIT,
        ...COMPILE_PROCESSES.map(({ name }) => name),
      ],
    },
  ];
}

const midnightProcesses = EXTERNAL_INFRA
  ? externalMidnightProcesses()
  : launchMidnight("@e2e/midnight-contracts", { resolveFrom: import.meta.dirname! }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: STORAGE_PASSWORD },
      dependsOn: COMPILE_PROCESSES.map(({ name }) => name),
    });

export default {
  processes: [
    ...launchPglite(),

    // ── Compile Midnight contracts (Compact) — app-specific per contract ─────
    ...COMPILE_PROCESSES,

    // ── Midnight infrastructure ───────────────────────────────────────────────
    ...midnightProcesses,

    // ── Sync ──────────────────────────────────────────────────────────────────
    { name: "sync", args: ["run", "e2e/midnight/node.ts"], waitToExit: false, type: "system-dependency" as const, env: { PGLITE: "true" }, dependsOn: [DbNames.PGLITE_WAIT, MidnightNames.CONTRACT_DEPLOY] },

    // ── Batcher ───────────────────────────────────────────────────────────────
    { name: "batcher", args: ["run", "e2e/midnight/batcher/main.ts"], stopProcessAtPort: [3334], waitToExit: false, dependsOn: [MidnightNames.CONTRACT_DEPLOY] },
    { name: "batcher-wait", args: ["./node_modules/.bin/wait-on", "tcp:3334"], waitToExit: true, dependsOn: ["batcher"] },
  ],
} satisfies OrchestratorConfig;
