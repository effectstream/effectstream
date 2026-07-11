// Transaction batcher for post-sale NFT minting.
//
// The sync node's nft-dispatch worker POSTs one mint job per NFT to this
// service's /send-input endpoint; the batcher holds its own funds, signs, and
// submits the actual on-chain mint, then returns the tx hash.
//
// EVM mints go through the generic EvmContractAdapter, which calls an arbitrary
// contract function — here `PreorderItemNft.mint(to)`. Each job is its own batch
// (size criteria, maxBatchSize 1) because EvmContractAdapter submits one call per
// batch. The Cardano adapter (Phase B) registers under the `cardanoNft` target.

import { main, suspend } from "effection";
import {
  createNewBatcher,
  FileStorage,
  EvmContractAdapter,
  type BatcherConfig,
} from "@effectstream/batcher-sdk";
import { hardhat } from "viem/chains";
import { TrustedAdapter } from "./trusted-adapter.ts";
import { CardanoMintAdapter } from "./cardano-mint-adapter.ts";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.BATCHER_PORT ?? "3334");
const rpcUrl = process.env.EVM_RPC ?? "http://localhost:8545";
// Hardhat account #9 — dedicated batcher account (funded, separate from the admin
// account #0 and the buyers, to avoid nonce contention). Override with EVM_PRIVATE_KEY.
const privateKey = (process.env.EVM_PRIVATE_KEY ??
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6") as `0x${string}`;

const here = import.meta.dirname!;
const extra = JSON.parse(
  fs.readFileSync(path.resolve(here, "../contracts-evm/build/extra-addresses.json"), "utf-8"),
);
const itemNftArtifact = JSON.parse(
  fs.readFileSync(
    path.resolve(
      here,
      "../contracts-evm/build/artifacts/hardhat/src/contracts/PreorderItemNft.sol/PreorderItemNft.json",
    ),
    "utf-8",
  ),
);

// Wrapped so the batcher accepts the node's unsigned, internal mint jobs.
const evmNft = new TrustedAdapter(
  new EvmContractAdapter({
    contractAddress: extra.itemNft as `0x${string}`,
    privateKey,
    syncProtocolName: "parallelEvmRpc",
    artifact: itemNftArtifact,
    chain: hardhat,
    rpcUrl,
    // NOTE: maxBatchSize is a BYTE budget, not a count. The nft-dispatch worker submits
    // serially (awaits each wait-receipt before the next), so only one input is ever queued
    // per batch; the default budget comfortably fits a single mint call.
  }),
);

// Cardano item-NFT mint (native policy + deliver). Lucid is lazy-initialised on first use.
const cardanoNft = new CardanoMintAdapter();

const config: BatcherConfig = {
  pollingIntervalMs: 500,
  adapters: { evmNft, cardanoNft },
  defaultTarget: "evmNft",
  namespace: "",
  batchingCriteria: {
    evmNft: { criteriaType: "size", maxBatchSize: 1 },
    cardanoNft: { criteriaType: "size", maxBatchSize: 1 },
  },
  confirmationLevel: "wait-receipt",
  enableHttpServer: true,
  port,
};

const batcher = createNewBatcher(config, new FileStorage("./batcher-data"));

main(function* () {
  batcher.addStateTransition("startup", ({ publicConfig }) => {
    console.log(`[batcher] startup — polling every ${publicConfig.pollingIntervalMs} ms`);
  });
  batcher.addStateTransition("http:start", ({ port }) => {
    console.log(`[batcher] HTTP server ready on port ${port}`);
  });
  yield* batcher.runBatcher();
  yield* suspend();
});
