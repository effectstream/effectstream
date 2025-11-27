import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";
import { launchBitcoin } from "@paimaexample/orchestrator/start-bitcoin";
import { dirname, fromFileUrl, resolve } from "@std/path";

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") ||
  "filler";

type FillerDefinition = {
  name: string;
  fillerPort: number;
  batcherPort: number;
  walletIndex: number;
};

type WalletType = "bitcoin" | "midnight";

// Get the directory of the current script
const currentDir = dirname(fromFileUrl(import.meta.url));

// Resolve wallet base paths to absolute paths
const walletBasePaths: Record<WalletType, string> = {
  bitcoin: resolve(currentDir, "../../../shared/contracts/bitcoin-contracts/generated"),
  midnight: resolve(currentDir, "../../../shared/contracts/midnight-contracts/generated"),
};

const getWalletPath = (type: WalletType, walletIndex: number) =>
  `${walletBasePaths[type]}/wallet-${walletIndex}.json`;

const fillerDefinitions: FillerDefinition[] = [
  { name: "Alpha Liquidity", fillerPort: 16101, batcherPort: 17101, walletIndex: 0 },
  { name: "Omega Swap", fillerPort: 16102, batcherPort: 17102, walletIndex: 1 },
  { name: "Quantum Pools", fillerPort: 16103, batcherPort: 17103, walletIndex: 2 },
  // { name: "Zenith Trade", fillerPort: 16104, batcherPort: 17104, walletIndex: 3 },
  // { name: "Orion Exchange", fillerPort: 16105, batcherPort: 17105, walletIndex: 4 },
  //{ name: "Nexus Liquidity", fillerPort: 16106, batcherPort: 17106, walletIndex: 5 },
  //{ name: "Phoenix Finance", fillerPort: 16107, batcherPort: 17107, walletIndex: 6 },
  //{ name: "Galaxy Swaps", fillerPort: 16108, batcherPort: 17108, walletIndex: 7 },
  //{ name: "Infinity Pools", fillerPort: 16109, batcherPort: 17109, walletIndex: 8 },
  //{ name: "Polaris Trade", fillerPort: 16110, batcherPort: 17110, walletIndex: 9 },
];

const customProcesses: any[] = [
  // /** DENO-FRONTEND-BLOCK */
  {
    name: "frontend-build",
    args: ["task", "-f", "@night-bitcoin/frontend", "build"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.MIDNIGHT_CONTRACT],
  },
  {
    name: "frontend-dApp",
    args: ["task", "-f", "@night-bitcoin/frontend", "serve"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10599",
    stopProcessAtPort: [10599],
    dependsOn: ["frontend-build"],
  },
  // /** DENO-FRONTEND-BLOCK */

  // /** EXPLORER-BLOCK */
  {
    name: "explorer",
    args: ["run", "-A", "--unstable-detect-cjs", "@paimaexample/explorer"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10590",
    stopProcessAtPort: [10590],
  },
  // /** EXPLORER-BLOCK */
];

const fillerProcesses = fillerDefinitions.map((filler, index) => {
  const slug = slugify(filler.name);
  const walletIndex = filler.walletIndex ?? index;
  const bitcoinWallet = getWalletPath("bitcoin", walletIndex);
  const midnightWallet = getWalletPath("midnight", walletIndex);

  return {
    name: `filler:${slug}`,
    args: [
      "task",
      "-f",
      "@night-bitcoin/filler",
      "start",
      filler.name,
      String(filler.fillerPort),
      bitcoinWallet,
      midnightWallet,
    ],
    waitToExit: false,
    type: "system-dependency",
    link: `http://localhost:${filler.fillerPort}`,
    stopProcessAtPort: [filler.fillerPort],
    dependsOn: ['create-wallets', 'create-wallets-midnight'],
  };
});

const config = Value.Parse(OrchestratorConfig, {
  // Launch system processes
  packageName: "jsr:@paimaexample",
  processes: {
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,
    // Launch Dev DB & Collector
    [ComponentNames.EFFECTSTREAM_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
    [ComponentNames.LOKI]: true,
  },

  // Launch my processes
  processesToLaunch: [
    ...launchMidnight("@night-bitcoin/midnight-contracts"),
    ...launchBitcoin("@night-bitcoin/bitcoin-contracts"),
    ...customProcesses,
    {
      name: "create-wallets",
      args: ["task", "-f", "@night-bitcoin/bitcoin-contracts", "create-wallets", "1.5", "3", "100"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [ComponentNames.BITCOIN_GENERATE_BLOCKS],
    },
    {
      name: "create-wallets-midnight",
      args: ["task", "-f", "@night-bitcoin/midnight-contracts", "create-wallets"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [ComponentNames.MIDNIGHT_CONTRACT],
    },
    {
      name: "mint-wallets-midnight",
      args: ["task", "-f", "@night-bitcoin/midnight-contracts", "mint-wallets"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: ['create-wallets-midnight'],
    },
    ...fillerProcesses,
  ],
});

if (Deno.env.get("EFFECTSTREAM_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
