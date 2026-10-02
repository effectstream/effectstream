// Local orchestrator: `bun run dev`.
//
// Process graph:
//   PGLite
//   build-bridge-program → Solana validator (bpfPrograms) → init-local-solana
//     (test mint, Initialize, dev user tokens; `solana` section of
//     deployments/local.json)
//   Midnight 2.x devnet via launchMidnight (node, indexer, DUST prover rc.5 on
//     :6300) + the contract prover 9.0.0-rc.8 on :6301 (Docker image; Q9 A).
//     With MIDNIGHT_CONTRACT_PROOF_SERVER_URL set, no contract prover is
//     started: the external one is waited for instead (Q10 A).
//   midnight-contract: compile (pinned compactc 0.35.0) + deploy the bridge,
//     after init-local-solana (it seals the SPL mint and the operator key);
//     writes the `midnight` section.
//   TODO(PR-2 T3/T4) the "sync" node with the in-process relayer.
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite } from "@effectstream/orchestrator/launch-pglite";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

const root = import.meta.dirname!;
const contractsSolana = path.join(root, "packages/contracts-solana");
const contractsMidnight = path.join(root, "packages/contracts-midnight");

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
  CONTRACT_PROVER: "midnight-contract-prover",
  CONTRACT_PROVER_WAIT: "midnight-contract-prover-wait",
} as const;

// Q10 A: an explicit contract-prover URL means "already running, do not launch".
const externalContractProver = !!process.env.MIDNIGHT_CONTRACT_PROOF_SERVER_URL?.trim();
const contractProverPort = Number(process.env.BRIDGE_CONTRACT_PROOF_SERVER_PORT ?? "6301");

const contractProverProcesses = [
  ...(externalContractProver
    ? []
    : [
        {
          name: BridgeProcessNames.CONTRACT_PROVER,
          description: "Contract prover 9.0.0-rc.8 (ed25519 mint circuit; Docker image)",
          cwd: contractsMidnight,
          args: ["run", "midnight-contract-prover:start"],
          waitToExit: false,
          critical: true,
          stopProcessAtPort: [contractProverPort],
        },
      ]),
  {
    name: BridgeProcessNames.CONTRACT_PROVER_WAIT,
    description: "Wait for the contract prover (9.0.0-rc.8)",
    cwd: contractsMidnight,
    args: ["run", "midnight-contract-prover:wait"],
    waitToExit: true,
    ...(externalContractProver ? {} : { dependsOn: [BridgeProcessNames.CONTRACT_PROVER] }),
  },
];

// launchMidnight's 7 scripts live in packages/contracts-midnight. Its deploy
// step (midnight-contract) compiles and deploys the bridge; it needs the
// Solana section (mint + operator) and the rc.8 prover first.
const midnightProcesses = launchMidnight(
  "@solana-midnight-bridge/contracts-midnight",
  { cwd: contractsMidnight },
  {
    env: { MIDNIGHT_STORAGE_PASSWORD: "BridgeLocalDevOnly-1!" },
    dependsOn: [BridgeProcessNames.INIT_LOCAL, BridgeProcessNames.CONTRACT_PROVER_WAIT],
  },
);

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

    ...contractProverProcesses,
    ...midnightProcesses,

    // TODO(PR-2 T3): { name: "sync", args: ["run", "packages/node/main.dev.ts"], env: { PGLITE: "true" },
    //   dependsOn: [DbNames.PGLITE_WAIT, BridgeProcessNames.INIT_LOCAL, <midnight deploy>] }
    // TODO(PR-2 T4): the relayer runs in the sync process (no separate entry).
  ],
} satisfies OrchestratorConfig;
