import type { Chain } from "viem";
import { parseEther } from "viem/utils";
import { createAndLaunchBatcher } from "./batcher.ts";
import { parseArgs } from "@std/cli/parse-args";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import * as chains from "viem/chains";
import { run } from "effection";
import { ENV } from "@effectstream/utils/node-env";
import { TypeboxHelpers } from "@effectstream/utils";
// Standalone Batcher service start script.
// Example usage:
// deno run -A --check packages/node-sdk/batcher/src/start.ts \
// --paimaL2Address=<0xPaimaL2Address> \
// --batcherPrivateKey=<0xBatcherPrivateKey> \
// --chainName=<mainnet|testnet|hardhat>
//
// This launches a batcher service that will listen for HTTP requests on the
// 3334 port.
//
// Example to send an input to the batcher:
// await fetch(localhost:3334/send-input, method: 'POST', body: BatchedSubunit({ ... }));
//

// Schema for command line arguments
const ArgsSchema = Type.Object({
  paimaL2Address: Type.String({
    pattern: "^0x[a-fA-F0-9]{40}$",
    description: "Ethereum address for Paima L2 contract",
  }),
  batcherPrivateKey: Type.String({
    pattern: "^0x[a-fA-F0-9]{64}$",
    description: "Private key for the batcher wallet",
  }),
  paimaSyncProtocolName: Type.String({
    description: "Name of the Paima Sync protocol to use",
  }),
  chainName: Type.String({
    description: "Name of the blockchain network to connect to",
  }),
  batchIntervalMs: Type.String({
    pattern: "^[0-9]+$",
    description: "Interval in milliseconds between batch processing",
  }),
  paimaL2Fee: Type.String({
    pattern: "^[0-9]+(\\.[0-9]+)?$",
    description: "Fee amount for Paima L2 transactions in ETH",
  }),
  namespace: Type.String({
    description: "Namespace for the batcher operations",
  }),
  maxBatchSize: Type.String({
    pattern: "^[0-9]+$",
    description: "Maximum number of transactions per batch",
  }),
  port: Type.String({
    pattern: "^[0-9]+$",
    description: "Port for the batcher HTTP server. Default: 3334",
  }),
});

type Args = Static<typeof ArgsSchema>;
let args: Args;
try {
  args = Value.Parse(
    ArgsSchema,
    parseArgs(Deno.args, {
      string: [
        "paimaL2Address",
        "batcherPrivateKey",
        "paimaSyncProtocolName",
        "chainName",
        "batchIntervalSeconds",
        "paimaL2Fee",
        "namespace",
        "maxBatchSize",
        "port",
        "checkTimeMs",
      ],
      default: {
        batchIntervalMs: "1000",
        paimaL2Fee: "0",
        namespace: "default",
        maxBatchSize: "1000",
        port: ENV.BATCHER_PORT,
      },
    }),
  );
} catch (error) {
  console.error(error);
  Deno.exit(1);
}

// TODO We want to probably let custom chains be passed in.
const chain = chains[args.chainName as keyof typeof chains] as Chain;
if (!chain) {
  console.error(`Chain ${args.chainName} not found`);
  Deno.exit(1);
}

await run(() =>
  createAndLaunchBatcher({
    paimaL2Address: Value.Decode(
      TypeboxHelpers.Evm.Address,
      args.paimaL2Address,
    ),
    batcherPrivateKey: Value.Decode(
      TypeboxHelpers.Evm.PrivateKey,
      args.batcherPrivateKey,
    ),
    chain: chain,
    batchIntervalMs: Number(args.batchIntervalMs),
    paimaL2Fee: parseEther(args.paimaL2Fee),
    paimaSyncProtocolName: args.paimaSyncProtocolName,
    namespace: args.namespace,
    maxBatchSize: Number(args.maxBatchSize),
    port: Number(args.port),
  })
);
