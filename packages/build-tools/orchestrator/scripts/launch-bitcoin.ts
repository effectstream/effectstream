import { ComponentNames } from "@effectstream/log";

// Start Bitcoin Core regtest node.
//
// This launcher expects the @effectstream/bitcoin-core package to provide an entry
// point that bootstraps bitcoind in regtest mode.
//
// packageName: the npm package that should be launched through deno.
//
export const launchBitcoin = (packageName: string): {
  stopProcessAtPort?: number[];
  name: string;
  args: string[];
  waitToExit?: boolean;
  logs?: string;
  logsStartDisabled?: boolean;
  disableStderr?: boolean;
  type?: string;
  dependsOn?: string[];
}[] => [
  {
    stopProcessAtPort: [18334, 18443],
    name: ComponentNames.BITCOIN_CORE,
    args: ["--filter", packageName, "chain:start"],
    waitToExit: false,
    logs: "raw",
    logsStartDisabled: true,
    type: "system-dependency",
  },
  {
    name: ComponentNames.BITCOIN_CORE_WAIT,
    args: ["--filter",packageName, "chain:wait"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_CORE],
  },
  {
    name: ComponentNames.BITCOIN_GENERATE_BLOCKS,
    args: ["--filter",packageName, "generate:blocks"],
    waitToExit: false, // Loop keeps blocks being mined
    logs: "raw",
    logsStartDisabled: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_CORE_WAIT],
  },
  {
    name: ComponentNames.BITCOIN_WAIT_FOR_BLOCK,
    args: ["--filter", packageName, "wait-for-block"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_GENERATE_BLOCKS],
  },
];

