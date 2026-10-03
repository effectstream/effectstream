// Live orchestrator: `bun run live` — Solana devnet + Midnight stagenet by
// default. Live mode only ever reaches chains through endpoints: another
// cluster/network (for example separately started local stand-ins) is selected
// with SOLANA_DEVNET_RPC_URL (+ SOLANA_EXPECTED_GENESIS_HASH for the deploy),
// MIDNIGHT_NETWORK_ID and the MIDNIGHT_INDEXER_HTTP/WS / MIDNIGHT_NODE_HTTP
// endpoints, and BRIDGE_DEPLOYMENT.
//
// No local chains run in live mode. The contracts are deployed once by
//   packages/contracts-solana/scripts/deploy-devnet.ts --out devnet-stagenet   (solana section)
//   packages/contracts-midnight/deploy.ts --mode stagenet                      (midnight section)
// into deployments/devnet-stagenet.json (BRIDGE_DEPLOYMENT selects another),
// and this file starts only local services against that deployment:
//   - the DUST prover (engine rc.5 binary, dust/9 as stagenet requires) on :6300,
//     unless MIDNIGHT_PROOF_SERVER_URL points at one;
//   - the contract prover 9.0.0-rc.8 on :6301 (Docker image; Q9 A), unless
//     MIDNIGHT_CONTRACT_PROOF_SERVER_URL points at one (Q10 A);
//   - PGLite and the bridge node (sync + state machine + API + relayer),
//     `packages/node/main.ts live`. Solana RPC from SOLANA_DEVNET_RPC_URL
//     (default the public devnet RPC); operator keys only from
//     ~/.config/solana-midnight-bridge/ or $BRIDGE_SECRETS_DIR (never from the repo).
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { DbNames, launchPglite } from "@effectstream/orchestrator/launch-pglite";

const root = import.meta.dirname!;
const contractsMidnight = path.join(root, "packages/contracts-midnight");

const externalDustProver = !!process.env.MIDNIGHT_PROOF_SERVER_URL?.trim();
const externalContractProver = !!process.env.MIDNIGHT_CONTRACT_PROOF_SERVER_URL?.trim();
const contractProverPort = Number(process.env.BRIDGE_CONTRACT_PROOF_SERVER_PORT ?? "6301");

export const LiveProcessNames = {
  DUST_PROVER: "midnight-dust-prover",
  DUST_PROVER_WAIT: "midnight-dust-prover-wait",
  CONTRACT_PROVER: "midnight-contract-prover",
  CONTRACT_PROVER_WAIT: "midnight-contract-prover-wait",
  SYNC: "sync",
} as const;

const proverWaits: string[] = [LiveProcessNames.CONTRACT_PROVER_WAIT];
if (!externalDustProver) proverWaits.push(LiveProcessNames.DUST_PROVER_WAIT);

export default {
  processes: [
    ...launchPglite(),

    ...(externalDustProver
      ? []
      : [
          {
            name: LiveProcessNames.DUST_PROVER,
            description: "DUST prover (9.0.0-rc.5, dust/9) for wallet fees",
            cwd: contractsMidnight,
            args: ["run", "midnight-proof-server:start"],
            waitToExit: false,
            critical: true,
            stopProcessAtPort: [6300],
          },
          {
            name: LiveProcessNames.DUST_PROVER_WAIT,
            description: "Wait for the DUST prover",
            cwd: contractsMidnight,
            args: ["run", "midnight-proof-server:wait"],
            waitToExit: true,
            dependsOn: [LiveProcessNames.DUST_PROVER],
          },
        ]),

    ...(externalContractProver
      ? []
      : [
          {
            name: LiveProcessNames.CONTRACT_PROVER,
            description: "Contract prover 9.0.0-rc.8 (ed25519 mint circuit; Docker image)",
            cwd: contractsMidnight,
            args: ["run", "midnight-contract-prover:start"],
            waitToExit: false,
            critical: true,
            stopProcessAtPort: [contractProverPort],
          },
        ]),
    {
      name: LiveProcessNames.CONTRACT_PROVER_WAIT,
      description: "Wait for the contract prover (9.0.0-rc.8)",
      cwd: contractsMidnight,
      args: ["run", "midnight-contract-prover:wait"],
      waitToExit: true,
      ...(externalContractProver ? {} : { dependsOn: [LiveProcessNames.CONTRACT_PROVER] }),
    },

    {
      name: LiveProcessNames.SYNC,
      description: "Bridge node (live): sync both chains, state machine, API, relayer",
      args: ["run", "packages/node/main.ts", "live"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      link: "http://localhost:9999/transfers",
      dependsOn: [DbNames.PGLITE_WAIT, ...proverWaits],
    },
  ],
} satisfies OrchestratorConfig;
