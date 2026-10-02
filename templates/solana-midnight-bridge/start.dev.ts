// Local orchestrator: `bun run dev`.
//
// Wired now (PR-2 T0/T1): PGLite, the bridge program build, a local Solana
// validator with the bridge preloaded (bpfPrograms), and `init-local`, which
// creates the test mint, initializes the bridge and writes the `solana` section
// of deployments/local.json.
//
// Still to wire (sub-plan plans/00050-solana-midnight-bridge-pr2-template.md):
//   TODO(PR-2 T2.1/T2.2) local Midnight 2.x devnet via launchMidnight
//                        (contracts-midnight's 7 scripts), the rc.8 contract
//                        prover next to the DUST prover (engine E2), and the
//                        bridge.compact deploy writing the `midnight` section;
//   TODO(PR-2 T3)        the "sync" node (SOLANA:ProgramLog + Midnight:Generic),
//                        depending on pglite-wait, init-local and the deploy;
//   TODO(PR-2 T4)        the in-process relayer (runs inside the node process).
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

const root = import.meta.dirname!;
const contractsSolana = path.join(root, "packages/contracts-solana");

// `cwd`, not `resolveFrom`: the template's own workspace packages are not
// resolvable through require.resolve once the orchestrator comes from npm.
const solanaProcesses = launchSolana("@solana-midnight-bridge/contracts-solana", {
  cwd: contractsSolana,
});
// The validator preloads build/bridge.so, so it must wait for the build step.
const validatorIdx = solanaProcesses.findIndex((p) => p.name === SolanaNames.SOLANA_VALIDATOR);
if (validatorIdx >= 0) {
  const validator = solanaProcesses[validatorIdx]!;
  solanaProcesses[validatorIdx] = {
    ...validator,
    dependsOn: [...(validator.dependsOn ?? []), "build-bridge-program"],
  };
}

export const BridgeProcessNames = {
  BUILD_PROGRAM: "build-bridge-program",
  INIT_LOCAL: "init-local-solana",
} as const;

export default {
  processes: [
    ...launchPglite(),

    // SKIP_SOLANA_BUILD=1 (default) reuses the committed build/bridge.so;
    // set =0 to force a native rebuild (see scripts/build-program.ts).
    {
      name: BridgeProcessNames.BUILD_PROGRAM,
      description: "Build (or reuse) the Solana bridge program .so",
      cwd: contractsSolana,
      args: ["run", "scripts/build.ts"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      env: { SKIP_SOLANA_BUILD: process.env.SKIP_SOLANA_BUILD ?? "1" },
    },

    ...solanaProcesses,

    {
      name: BridgeProcessNames.INIT_LOCAL,
      description: "Create the test mint, initialize the bridge, fund the dev user, write deployments/local.json",
      cwd: contractsSolana,
      args: ["run", "scripts/init-local.ts"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [SolanaNames.SOLANA_VALIDATOR_WAIT],
    },

    // TODO(PR-2 T2.1/T2.2): ...launchMidnight("@solana-midnight-bridge/contracts-midnight", { cwd: … })
    //   plus the rc.8 contract prover and the bridge deploy.
    // TODO(PR-2 T3): { name: "sync", args: ["run", "packages/node/main.dev.ts"], env: { PGLITE: "true" },
    //   dependsOn: [DbNames.PGLITE_WAIT, BridgeProcessNames.INIT_LOCAL, <midnight deploy>] }
    // TODO(PR-2 T4): the relayer runs in the sync process (no separate entry).
  ],
} satisfies OrchestratorConfig;
