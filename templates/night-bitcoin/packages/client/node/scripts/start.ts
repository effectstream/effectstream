import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";

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
    name: "frontend-server",
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
  },

  // Launch my processes
  processesToLaunch: [
    

    
    ...launchMidnight("@night-bitcoin/midnight-contracts"),
    


    ...customProcesses,
  ],
});

if (Deno.env.get("EFFECTSTREAM_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
