import { ComponentNames } from "@effectstream/log";

// Start Bitcoin Core regtest node.
//
// This launcher expects the @effectstream/bitcoin-core package to provide an entry
// point that bootstraps bitcoind in regtest mode.
//
// packageName: the npm package that should be launched through deno.
//
export const launchBitcoin = (packageName: string, logs: 'none' | 'default' = 'default'): {
  stopProcessAtPort?: number[];
  name: string;
  args: string[];
  waitToExit?: boolean;
  logs?: string;
  type?: string;
  dependsOn?: string[];
}[] => [
  {
    stopProcessAtPort: [18334, 18443],
    name: ComponentNames.BITCOIN_CORE,
    args: ["task", "-f", packageName, "chain:start"],
    waitToExit: false,
    logs: logs === 'default' ? "tsLogOrchestratorAdapter" : 'none',
    type: "system-dependency",
  },
  {
    name: ComponentNames.BITCOIN_CORE_WAIT,
    args: ["task", "-f", packageName, "chain:wait"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_CORE],
  },
  {
    name: ComponentNames.BITCOIN_GENERATE_BLOCKS,
    args: ["task", "-f", packageName, "generate:blocks"],
    waitToExit: false, // Loop keeps blocks being mined
    logs: logs === 'default' ? "raw" : 'none',
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_CORE_WAIT],
  },
  {
    name: ComponentNames.BITCOIN_WAIT_FOR_BLOCK,
    args: ["task", "-f", packageName, "wait-for-block"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_GENERATE_BLOCKS],
  },
];

