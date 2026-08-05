import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

const root = import.meta.dirname!;

// The validator must wait for the counter build: chain-start.ts needs
// counter.so on disk to pass `--bpf-program`.
// `cwd`, not `resolveFrom`: resolveFrom goes through
// require.resolve(pkg, { paths }), which cannot see this template's own
// workspace packages once @effectstream/orchestrator is installed from npm
// rather than symlinked by link.sh — they are not linked into node_modules.
// Every other template passes an explicit path for the same reason.
const solanaProcesses = launchSolana("@solana-starter/node", {
  cwd: path.join(root, "packages/node"),
});
const solanaValidatorIdx = solanaProcesses.findIndex(
  (p) => p.name === SolanaNames.SOLANA_VALIDATOR,
);
if (solanaValidatorIdx >= 0) {
  solanaProcesses[solanaValidatorIdx] = {
    ...solanaProcesses[solanaValidatorIdx],
    dependsOn: [
      ...(solanaProcesses[solanaValidatorIdx].dependsOn ?? []),
      "build-counter",
    ],
  };
}

export default {
  processes: [
    ...launchPglite(),

    // SKIP_SOLANA_BUILD=1 (default) reuses build/counter.so when present and
    // compiles it when absent; set =0 to force a recompile every boot.
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
      name: "sync",
      description: "Solana starter sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, SolanaNames.SOLANA_VALIDATOR_WAIT],
    },

    // Fund the batcher fee-payer wallet so it can pay gas.
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
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: ["airdrop-batcher"],
    },

    {
      name: "frontend",
      description: "Vite + React frontend on :5173",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "dev"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:5173",
      stopProcessAtPort: [5173],
      dependsOn: ["batcher"],
    },
  ],
} satisfies OrchestratorConfig;
