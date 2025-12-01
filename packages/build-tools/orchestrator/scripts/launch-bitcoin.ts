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
  type?: string;
  dependsOn?: string[];
}[] => [
  {
    stopProcessAtPort: [18334, 18443],
    name: ComponentNames.BITCOIN_CORE,
    args: ["-A", "@effectstream/bitcoin-core"],
    waitToExit: false,
    logs: "raw",
    type: "system-dependency",
  },
  {
    name: ComponentNames.BITCOIN_CORE_WAIT,
    args: ["task", "-f", packageName, "wait"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_CORE],
  },
  {
    name: "btc-blocks",
    args: ["task", "-f", packageName, "generate-blocks"],
    waitToExit: false, // Loop keeps blocks being mined
    logs: "raw",
    type: "system-dependency",
    dependsOn: [ComponentNames.BITCOIN_CORE_WAIT],
  }
];

