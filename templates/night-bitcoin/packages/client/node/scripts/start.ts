import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";
import { launchBitcoin } from "@paimaexample/orchestrator/start-bitcoin";

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") ||
  "filler";

const fillerDefinitions = [
  { name: "Alpha Liquidity", fillerPort: 16101, batcherPort: 17101 },
  { name: "Omega Swap", fillerPort: 16102, batcherPort: 17102 },
  { name: "Quantum Pools", fillerPort: 16103, batcherPort: 17103 },
  { name: "Zenith Trade", fillerPort: 16104, batcherPort: 17104 },
  { name: "Orion Exchange", fillerPort: 16105, batcherPort: 17105 },
  { name: "Nexus Liquidity", fillerPort: 16106, batcherPort: 17106 },
  { name: "Phoenix Finance", fillerPort: 16107, batcherPort: 17107 },
  { name: "Galaxy Swaps", fillerPort: 16108, batcherPort: 17108 },
  { name: "Infinity Pools", fillerPort: 16109, batcherPort: 17109 },
  { name: "Polaris Trade", fillerPort: 16110, batcherPort: 17110 },
];

const customProcesses: any[] = [
  // /** DENO-FRONTEND-BLOCK */
  // {
  //   name: "frontend-build",
  //   args: ["task", "-f", "@night-bitcoin/frontend", "build"],
  //   waitToExit: true,
  //   type: "system-dependency",
  //   dependsOn: [], // [ComponentNames.MIDNIGHT_CONTRACT],
  // },
  // {
  //   name: "frontend-server",
  //   args: ["task", "-f", "@night-bitcoin/frontend", "serve"],
  //   waitToExit: false,
  //   type: "system-dependency",
  //   link: "http://localhost:10599",
  //   stopProcessAtPort: [10599],
  //   dependsOn: ["frontend-build"],
  // },
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

const fillerProcesses = fillerDefinitions.flatMap((filler) => {
  const slug = slugify(filler.name);
  return [
    {
      name: `filler:${slug}`,
      args: [
        "task",
        "-f",
        "@night-bitcoin/filler",
        "start",
        filler.name,
        String(filler.fillerPort),
      ],
      waitToExit: false,
      type: "system-dependency",
      link: `http://localhost:${filler.fillerPort}`,
      stopProcessAtPort: [filler.fillerPort],
      dependsOn: [ComponentNames.MIDNIGHT_CONTRACT],
    },
  ];
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
