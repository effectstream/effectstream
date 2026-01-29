import { ComponentNames } from "@effectstream/log";

// Start Cardano Node and Indexer.
//
// This is a example launcher for Cardano Chains and Contracts.
// Working implementation examples are provided in the /templates/* folders.
// Normally you would not need to modify this file.
//
// This file requires you to provide a workspace package with the following tasks:
//
// devkit:start: start the yaci-devkit node
// devkit:wait: wait for the yaci-devkit node to start
// dolos:start: start the dolos node
// dolos:wait: wait for the dolos node to start
//
// packageName: the name of the package that implements the tasks.
//
export const launchCardano = (packageName: string): {
  stopProcessAtPort?: number[];
  name: string;
  args: string[];
  waitToExit?: boolean;
  logs?: string;
  logsStartDisabled?: boolean;
  disableStderr?: boolean;
  type?: string;
  dependsOn?: string[];
  cwd?: string;
  command?: string;
}[] => {
  const yaciDir = `${Deno.env.get("HOME")}/.yaci-cli`;
  const yaciCliPath = `${yaciDir}/yaci-cli`;

  // TODO $HOME/.yaci-cli/yaci-cli must be installed to allow this to work.
  // At the time the npm packages is incompatible with deno.
  try {
    Deno.statSync(yaciCliPath);
  } catch (_error) {
    throw new Error(
      `Cardano launcher skipped: missing ${yaciCliPath}. Run yaci-cli setup.`,
    );
  }
  // TODO We require the latest dolos binary built from source.
  // At the time there is not npm package for the latest dolos binary.
  try {
    const dolosExists = new Deno.Command("deno", {
      args: ["task", "-f", "@e2e/cardano-contracts", "dolos:exists"],
    }).outputSync();
    if (!dolosExists.success) throw new Error();
  } catch (_error) {
    throw new Error(
      "Cardano launcher skipped: dolos binary is missing.",
    );
  }

 
 return [
    {
      stopProcessAtPort: [8090, 10000, 50051, 3001],
      cwd: yaciDir,
      command: "./yaci-cli",
      args: ["up"],
      name: ComponentNames.YACI_DEVKIT,
      waitToExit: false,
      type: "system-dependency",
      logsStartDisabled: true,
    },
    {
      name: ComponentNames.YACI_DEVKIT_WAIT,
      args: ["task", "-f", packageName, "devkit:wait"],
      // dependsOn: [ComponentNames.YACI_DEVKIT],
    },
    {
      name: ComponentNames.DOLOS,
      args: ["task", "-f", packageName, "dolos:start"],
      waitToExit: false,
      logs: "raw",
      logsStartDisabled: true,
      disableStderr: true,
      type: "system-dependency",
      dependsOn: [ComponentNames.YACI_DEVKIT_WAIT],
    },
    {
      name: ComponentNames.DOLOS_WAIT,
      args: ["task", "-f", packageName, "dolos:wait"],
      dependsOn: [ComponentNames.DOLOS],
    },
  ];
}