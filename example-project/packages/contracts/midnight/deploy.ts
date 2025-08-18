// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as log from "https://deno.land/std@0.224.0/log/mod.ts";

import {
  NetworkId,
  setNetworkId,
} from "npm:@midnight-ntwrk/midnight-js-network-id@2.0.2";
import {
  type BalancedTransaction,
  type MidnightProvider,
  type UnbalancedTransaction,
  type WalletProvider,
} from "npm:@midnight-ntwrk/midnight-js-types@2.0.2";
import { type Resource, WalletBuilder } from "npm:@midnight-ntwrk/wallet@5.0.0";
import { type Wallet } from "npm:@midnight-ntwrk/wallet-api@5.0.0";
import {
  Transaction as ZswapTransaction,
} from "npm:@midnight-ntwrk/zswap@4.0.0";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "npm:@midnight-ntwrk/ledger@4.0.0";
import { deployContract } from "npm:@midnight-ntwrk/midnight-js-contracts@2.0.2";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "./contract/src/index.original.ts";
import { indexerPublicDataProvider } from "npm:@midnight-ntwrk/midnight-js-indexer-public-data-provider@2.0.2";
import { httpClientProofProvider } from "npm:@midnight-ntwrk/midnight-js-http-client-proof-provider@2.0.2";
import { NodeZkConfigProvider } from "npm:@midnight-ntwrk/midnight-js-node-zk-config-provider@2.0.2";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import * as Rx from "npm:rxjs@7.8.1";
import { levelPrivateStateProvider } from "npm:@midnight-ntwrk/midnight-js-level-private-state-provider@2.0.2";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
} from "npm:@midnight-ntwrk/midnight-js-network-id@2.0.2";
import { createBalancedTx } from "npm:@midnight-ntwrk/midnight-js-types@2.0.2";

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const currentDir = path.dirname(path.fromFileUrl(import.meta.url));

const contractConfig = {
  privateStateStoreName: "counter-private-state",
  zkConfigPath: path.resolve(
    currentDir,
    "contract",
    "src",
    "managed",
    "counter",
  ),
};

class StandaloneConfig {
  logDir = path.resolve(
    currentDir,
    "counter-cli",
    "logs",
    "standalone",
    `${new Date().toISOString()}.log`,
  );
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId(NetworkId.Undeployed);
  }
}

const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        log.info(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state) => {
        // Let's allow progress only if wallet is synced
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const buildWalletAndWaitForFunds = async (
  config: StandaloneConfig,
  seed: string,
): Promise<Wallet & Resource> => {
  log.info("Building wallet from scratch");
  const wallet = await WalletBuilder.buildFromSeed(
    config.indexer,
    config.indexerWS,
    config.proofServer,
    config.node,
    seed,
    getZswapNetworkId(),
    "info",
  );
  wallet.start();

  const state = await Rx.firstValueFrom(wallet.state());
  log.info(`Your wallet seed is: ${seed}`);
  log.info(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  if (balance === undefined || balance === 0n) {
    log.info(`Your wallet balance is: 0`);
    log.info(`Waiting to receive tokens...`);
    balance = await waitForFunds(wallet);
  }
  log.info(`Your wallet balance is: ${balance}`);
  return wallet;
};

const createWalletAndMidnightProvider = async (
  wallet: Wallet,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    balanceTx(
      tx: UnbalancedTransaction,
      newCoins: CoinInfo[],
    ): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(
          ZswapTransaction.deserialize(
            tx.serialize(getLedgerNetworkId()),
            getZswapNetworkId(),
          ),
          newCoins,
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) =>
          Transaction.deserialize(
            zswapTx.serialize(getZswapNetworkId()),
            getLedgerNetworkId(),
          )
        )
        .then(createBalancedTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
};

const configureProviders = async (
  wallet: Wallet & Resource,
  config: StandaloneConfig,
) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet,
  );
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: contractConfig.privateStateStoreName,
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider(contractConfig.zkConfigPath),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

const deploy = async () => {
  await log.setup({
    handlers: {
      console: new log.ConsoleHandler("INFO"),
    },
    loggers: {
      default: {
        level: "INFO",
        handlers: ["console"],
      },
    },
  });

  const config = new StandaloneConfig();

  let wallet: (Wallet & Resource) | null = null;

  try {
    log.info("Building wallet...");
    wallet = await buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED);
    log.info("Wallet built successfully.");

    log.info("Configuring providers...");
    const providers = await configureProviders(wallet, config);
    log.info("Providers configured.");

    log.info("Deploying contract...");
    const contract = new Counter.Contract(witnesses);
    const deployedContract = await deployContract(providers, {
      contract: contract,
      privateStateId: "counterPrivateState",
      initialPrivateState: { privateCounter: 0 } as CounterPrivateState,
    });
    log.info("Contract deployed.");

    const contractAddress =
      deployedContract.deployTxData.public.contractAddress;
    console.log(contractAddress);
    const outputPath = path.join(currentDir, "contract.json");
    await Deno.writeTextFile(
      outputPath,
      JSON.stringify({ contractAddress }, null, 2),
    );
    log.info(`Contract address saved to ${outputPath}`);
  } catch (e) {
    if (e instanceof Error) {
      log.error(`Deployment failed: ${e.message}`);
      log.debug(e.stack);
    } else {
      log.error("An unknown error occurred during deployment.");
    }
    Deno.exit(1);
  } finally {
    if (wallet) {
      log.info("Closing wallet...");
      /*await wallet.close().catch((e) => {
        log.error(`Error closing wallet: ${e.message}`);
      });*/
      log.info("Wallet closed.");
    }
  }
};

deploy()
  .then(() => {
    console.log("Deployment successful");
    Deno.exit(0);
  })
  .catch((e) => {
    console.error("Unhandled error:", e);
    Deno.exit(1);
  });
