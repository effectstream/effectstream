import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";

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

  // /** BATCHER-BLOCK */
  // {
  //   name: "batcher",
  //   args: ["task", "-f", "@night-bitcoin/batcher", "start"],
  //   waitToExit: false,
  //   type: "system-dependency",
  //   link: "http://localhost:3334",
  //   stopProcessAtPort: [3334],
  //   dependsOn: [ComponentNames.MIDNIGHT_CONTRACT],
  // },
  // /** BATCHER-BLOCK */
]

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
    ...customProcesses,
    {
      name: "filler:alpha-liquidity",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Alpha Liquidity", "16101"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16101",
      stopProcessAtPort: [16101],
    },
    {
      name: "filler:omega-swap",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Omega Swap", "16102"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16102",
      stopProcessAtPort: [16102],
    },
    {
      name: "filler:quantum-pools",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Quantum Pools", "16103"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16103",
      stopProcessAtPort: [16103],
    },
    {
      name: "filler:zenith-trade",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Zenith Trade", "16104"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16104",
      stopProcessAtPort: [16104],
    },
    {
      name: "filler:orion-exchange",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Orion Exchange", "16105"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16105",
      stopProcessAtPort: [16105],
    },
    {
      name: "filler:nexus-liquidity",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Nexus Liquidity", "16106"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16106",
      stopProcessAtPort: [16106],
    },
    {
      name: "filler:phoenix-finance",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Phoenix Finance", "16107"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16107",
      stopProcessAtPort: [16107],
    },
    {
      name: "filler:galaxy-swaps",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Galaxy Swaps", "16108"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16108",
      stopProcessAtPort: [16108],
    },
    {
      name: "filler:infinity-pools",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Infinity Pools", "16109"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16109",
      stopProcessAtPort: [16109],
    },
    {
      name: "filler:polaris-trade",
      args: ["task", "-f", "@night-bitcoin/filler", "start", "Polaris Trade", "16110"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:16110",
      stopProcessAtPort: [16110],
    },
  ],
});

if (Deno.env.get("EFFECTSTREAM_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);

