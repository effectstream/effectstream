import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchBitcoin, BitcoinNames } from "@effectstream/orchestrator/launch-bitcoin";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;
const MIDNIGHT_GENESIS_PREPARE = "midnight-genesis-prepare";

const midnightProcesses = launchMidnight(
  "@night-bitcoin/contracts-midnight",
  { cwd: path.join(root, "packages/contracts-midnight") },
  { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
).map((process) => {
  if (process.name === MidnightNames.NODE) {
    return {
      ...process,
      dependsOn: [MIDNIGHT_GENESIS_PREPARE, ...(process.dependsOn ?? [])],
    };
  }
  if (
    process.name === MidnightNames.INDEXER ||
    process.name === MidnightNames.PROOF_SERVER
  ) {
    return { ...process, dependsOn: [MidnightNames.NODE_WAIT] };
  }
  return process;
});

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") ||
  "filler";

type FillerDefinition = {
  name: string;
  fillerPort: number;
  batcherPort: number;
  walletIndex: number;
};

const fillerDefinitions: FillerDefinition[] = [
  { name: "Alpha Liquidity", fillerPort: 16101, batcherPort: 17101, walletIndex: 0 },
  { name: "Omega Swap", fillerPort: 16102, batcherPort: 17102, walletIndex: 1 },
  { name: "Quantum Pools", fillerPort: 16103, batcherPort: 17103, walletIndex: 2 },
];

const bitcoinWalletDir = path.join(root, "packages/contracts-bitcoin/generated");
const midnightWalletDir = path.join(root, "packages/contracts-midnight/generated");
const getWalletPath = (chain: "bitcoin" | "midnight", walletIndex: number) =>
  path.join(chain === "bitcoin" ? bitcoinWalletDir : midnightWalletDir, `wallet-${walletIndex}.json`);

const fillerProcesses = fillerDefinitions.map((filler) => {
  const slug = slugify(filler.name);
  return {
    name: `filler:${slug}`,
    description: `Liquidity filler — ${filler.name}`,
    args: [
      "run",
      "--filter",
      "@night-bitcoin/filler",
      "start",
      filler.name,
      String(filler.fillerPort),
      getWalletPath("bitcoin", filler.walletIndex),
      getWalletPath("midnight", filler.walletIndex),
    ],
    waitToExit: false,
    type: "system-dependency" as const,
    link: `http://localhost:${filler.fillerPort}`,
    stopProcessAtPort: [filler.fillerPort],
    dependsOn: ["create-wallets-bitcoin", "create-wallets-midnight", "mint-wallets-midnight"],
  };
});

export default {
  processes: [
    ...launchPglite(),
    ...launchBitcoin("@night-bitcoin/contracts-bitcoin", { cwd: path.join(root, "packages/contracts-bitcoin") }),
    {
      name: MIDNIGHT_GENESIS_PREPARE,
      description: "Prepare or verify the cached Night-Bitcoin custom genesis",
      args: ["run", "--filter", "@night-bitcoin/contracts-midnight", "midnight-genesis:prepare"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
    },
    ...midnightProcesses,

    {
      name: "create-wallets-bitcoin",
      description: "Create Bitcoin filler wallets and fund them",
      args: ["run", "--filter", "@night-bitcoin/contracts-bitcoin", "create-wallets", "1.5", "3", "100"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [BitcoinNames.BITCOIN_WAIT_FOR_BLOCK],
    },
    {
      name: "create-wallets-midnight",
      description: "Create Midnight filler wallets",
      args: ["run", "--filter", "@night-bitcoin/contracts-midnight", "create-wallets"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [MidnightNames.CONTRACT_DEPLOY],
    },
    {
      name: "mint-wallets-midnight",
      description: "Verify genesis-prefunded NIGHT/DUST and mint filler M20 inventory",
      args: ["run", "--filter", "@night-bitcoin/contracts-midnight", "mint-wallets"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: ["create-wallets-midnight"],
    },

    {
      name: "sync",
      description: "Night-Bitcoin sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ORCHESTRATOR_PORT: "4747" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        MidnightNames.CONTRACT_DEPLOY,
        BitcoinNames.BITCOIN_WAIT_FOR_BLOCK,
        "create-wallets-bitcoin",
        "mint-wallets-midnight",
      ],
    },

    {
      name: "balancing-batcher",
      description: "Balancing batcher (Midnight + Bitcoin)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [MidnightNames.CONTRACT_DEPLOY],
    },

    ...fillerProcesses,

    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [MidnightNames.CONTRACT_DEPLOY],
    },
    {
      name: "frontend-server",
      description: "Serve frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "serve"],
      waitToExit: false,
      type: "system-dependency",
      critical: true,
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build"],
    },
  ],
} satisfies OrchestratorConfig;
