import { ComponentNames } from "@paimaexample/log";

export const startCardano = {
  // Start Caradano (yaci-devkit) and Dolos (indexer).
  stopProcessAtPort: [8090, 10000, 50051, 3001],
  processes: [
    {
      name: ComponentNames.YACI_DEVKIT,
      args: ["task", "-f", "@example/cardano-contracts", "devkit:start"],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: ComponentNames.YACI_DEVKIT_WAIT,
      args: ["task", "-f", "@example/cardano-contracts", "devkit:wait"],
    },
    {
      name: ComponentNames.DOLOS,
      args: ["task", "-f", "@example/cardano-contracts", "dolos:start"],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: ComponentNames.DOLOS_WAIT,
      args: ["task", "-f", "@example/cardano-contracts", "dolos:wait"],
    },
  ],
};
