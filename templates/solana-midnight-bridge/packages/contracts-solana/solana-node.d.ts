// Types for @effectstream/solana-node, which ships plain JavaScript
// (packages/binaries/solana-node/index.js). Only what this template uses.
declare module "@effectstream/solana-node" {
  import type { ChildProcess } from "node:child_process";

  export type RunOptions = {
    config?: string;
    dataDir?: string;
    verbose?: boolean;
    reset?: boolean;
    rpcPort?: number;
    faucetPort?: number;
    /** Defaults to $SOLANA_BIND_ADDRESS or 127.0.0.1 (Agave 3.0.14 panics on 0.0.0.0). */
    bindAddress?: string;
    bpfPrograms?: { address: string; soPath: string }[];
  };

  export type RunResult = {
    child: ChildProcess;
    dataDir: string;
    ledgerDir: string;
    rpcPort: number;
    faucetPort: number;
    stop: () => void;
  };

  /** Downloads (if needed), verifies and starts solana-test-validator. */
  export function run(options?: RunOptions): Promise<RunResult>;

  /** The @xhmikosr/bin-wrapper instance: path() is vendor/bin/solana-test-validator. */
  const bin: {
    path(): string;
    dest(): string;
    download(): Promise<void>;
  };
  export default bin;
}
