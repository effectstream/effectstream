import { ComponentNames } from "@paima/log";

export const launchCardano = {
  // TODO "stopProcessAtPort" is a workaround to kill any processes that are still running from a previous run.
  // Cardano processes 8090, 10000. Do not terminate cleanly.
  // Unfortunately required because of https://github.com/bloxbean/yaci-devkit/issues/94
  stopProcessAtPort: [8090, 10000, 50051, 3001],
  processes: [
    {
      name: ComponentNames.YACI_DEVKIT,
      args: ["task", "-f", "@e2e/cardano-contracts", "devkit:start"],
      waitToExit: false,
      logs: "otel-compatible",
      type: "system-dependency",
    },
    {
      name: ComponentNames.YACI_DEVKIT_WAIT,
      args: ["task", "-f", "@e2e/cardano-contracts", "devkit:wait"],
    },
    {
      name: ComponentNames.DOLOS,
      args: ["task", "-f", "@e2e/cardano-contracts", "dolos:start"],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: ComponentNames.DOLOS_WAIT,
      args: ["task", "-f", "@e2e/cardano-contracts", "dolos:wait"],
    },
  ],
};
