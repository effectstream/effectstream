import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

const root = path.resolve(import.meta.dirname!, "../..");

// Same dependency wiring as start.dev.ts: build-counter must finish before
// the validator runs so chain-start.ts has a counter.so to pass via
// --bpf-program.
// `cwd`, not `resolveFrom`: resolveFrom goes through
// require.resolve(pkg, { paths }), which cannot see this template's own
// workspace packages once @effectstream/orchestrator is installed from npm
// rather than symlinked by link.sh — they are not linked into node_modules.
// Every other template passes an explicit path for the same reason.
const solanaProcesses = launchSolana("@solana-starter/node", {
  cwd: path.join(root, "packages/node"),
});
const idx = solanaProcesses.findIndex((p) => p.name === SolanaNames.SOLANA_VALIDATOR);
if (idx >= 0) {
  solanaProcesses[idx] = {
    ...solanaProcesses[idx],
    dependsOn: [...(solanaProcesses[idx].dependsOn ?? []), "build-counter"],
  };
}

export default {
  processes: [
    ...launchPglite(),
    {
      name: "build-counter",
      description: "Build the Solana counter program (.so)",
      cwd: path.join(root, "packages/contracts-solana"),
      args: ["run", "scripts/build.ts"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      env: { SKIP_SOLANA_BUILD: process.env.SKIP_SOLANA_BUILD ?? "1" },
    },
    ...solanaProcesses,
    {
      name: "airdrop-batcher",
      description: "Airdrop SOL to batcher wallet",
      args: ["run", "packages/node/airdrop.ts"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [SolanaNames.SOLANA_VALIDATOR_WAIT],
    },
    {
      name: "batcher",
      description: "Solana transaction batcher ( fee-payer )",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      stopProcessAtPort: [3334],
      dependsOn: ["airdrop-batcher"],
    },
    {
      name: "sync",
      description: "Sync node ( test mode )",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, SolanaNames.SOLANA_VALIDATOR_WAIT],
    },
  ],
} satisfies OrchestratorConfig;
