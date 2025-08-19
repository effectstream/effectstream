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

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  type ContractAddress,
  NetworkId,
} from "npm:@midnight-ntwrk/compact-runtime";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "./contract/src/_index.ts";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "npm:@midnight-ntwrk/ledger";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "npm:@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "npm:@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "npm:@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "npm:@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnbalancedTransaction,
  type WalletProvider,
} from "npm:@midnight-ntwrk/midnight-js-types";
import { type Resource, WalletBuilder } from "npm:@midnight-ntwrk/wallet";
import { type Wallet } from "npm:@midnight-ntwrk/wallet-api";
import { Transaction as ZswapTransaction } from "npm:@midnight-ntwrk/zswap";
import * as Rx from "npm:rxjs";
import { WebSocket } from "npm:ws";
import { levelPrivateStateProvider } from "npm:@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  assertIsContractAddress,
  toHex,
} from "npm:@midnight-ntwrk/midnight-js-utils";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  setNetworkId,
} from "npm:@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "jsr:@std/path";
import { exists } from "jsr:@std/fs";
// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type CounterCircuits = ImpureCircuitId<Counter.Contract<CounterPrivateState>>;

const CounterPrivateStateId = "counterPrivateState";

type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof CounterPrivateStateId,
  CounterPrivateState
>;

type CounterContract = Counter.Contract<CounterPrivateState>;

type DeployedCounterContract =
  | DeployedContract<CounterContract>
  | FoundContract<CounterContract>;

// Inlined config for standalone script
const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

const contractConfig = {
  privateStateStoreName: "counter-private-state",
  zkConfigPath: resolve(
    currentDir,
    "contract",
    "src",
    "managed",
    "counter",
  ),
};

interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  logDir = resolve(
    currentDir,
    "..",
    "logs",
    "standalone",
    `${new Date().toISOString()}.log`,
  );
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId("Undeployed" as unknown as NetworkId);
  }
}

/**
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

// Standalone helper functions
const counterContractInstance: CounterContract = new Counter.Contract(
  witnesses,
);

const getCounterLedgerState = async (
  providers: CounterProviders,
  contractAddress: ContractAddress,
): Promise<bigint | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state_ = contractState != null
      ? Counter.ledger(contractState.data)
      : null;
    const state = state_?.round;
    const contractAddress_ = state_?.contract_address;
    const token_id = state_?.token_id;
    const property_name = state_?.property_name;
    const value = state_?.value;

    console.log(Counter.ledger(contractState?.data));
    console.log(`📊 Ledger state: ${state}`);
    console.log(`📊 Contract address: ${contractAddress_}`);
    console.log(`📊 Token id: ${token_id}`);
    console.log(
      `📊 Property name: ${new TextDecoder("utf-8").decode(property_name)}`,
    );
    console.log(
      `📊 Value: ${new TextDecoder("utf-8").decode(value)}`,
    );
    return state!;
  } catch (error) {
    console.error("❌ Error getting counter ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: CounterProviders,
  contractAddress: string,
): Promise<DeployedCounterContract> => {
  const counterContract = await findDeployedContract(providers, {
    contractAddress,
    contract: counterContractInstance,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 },
  });
  console.log(
    `Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`,
  );
  return counterContract;
};

const increment = async (
  counterContract: DeployedCounterContract,
): Promise<FinalizedTxData> => {
  console.log("Incrementing...");
  const toEncodedString = (str: string, length = 32) =>
    Uint8Array.from(
      str.padEnd(length, " ").split("").map((c) => c.charCodeAt(0)),
    );
  const finalizedTxData = await counterContract.callTx.increment(
    toEncodedString("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 64),
    toEncodedString("1754401682327", 64),
    toEncodedString("test A", 32),
    toEncodedString("test B", 32),
  );
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  return finalizedTxData.public;
};

const displayCounterValue = async (
  providers: CounterProviders,
  counterContract: DeployedCounterContract,
): Promise<{ counterValue: bigint | null; contractAddress: string }> => {
  const contractAddress = counterContract.deployTxData.public.contractAddress;
  const counterValue = await getCounterLedgerState(providers, contractAddress);
  if (counterValue === null) {
    console.log(`There is no counter contract deployed at ${contractAddress}.`);
  } else {
    console.log(`Current counter value: ${Number(counterValue)}`);
  }
  return { contractAddress, counterValue };
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

const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state: any) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        console.log(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state: any) => {
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s: any) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
  filename: string,
): Promise<Wallet & Resource> => {
  const directoryPath = Deno.env.get("SYNC_CACHE");
  let wallet: Wallet & Resource;
  if (directoryPath !== undefined) {
    const fullPath = `${directoryPath}/${filename}`;
    if (await exists(fullPath)) {
      console.log(
        `Attempting to restore state from ${fullPath}`,
      );
      try {
        const serialized = await Deno.readFile(fullPath);
        wallet = await WalletBuilder.restore(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          serialized,
          "info",
        );
        wallet.start();
      } catch (error: unknown) {
        console.log(
          "Wallet was not able to restore using the stored state, building wallet from scratch",
        );
        wallet = await WalletBuilder.buildFromSeed(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          getZswapNetworkId(),
          "info",
        );
        wallet.start();
      }
    } else {
      console.log("Wallet save file not found, building wallet from scratch");
      wallet = await WalletBuilder.buildFromSeed(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        getZswapNetworkId(),
        "info",
      );
      wallet.start();
    }
  } else {
    console.log(
      "📁 File path for save file not found, building wallet from scratch",
    );

    try {
      wallet = await WalletBuilder.buildFromSeed(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        NetworkId.Undeployed,
        "info",
      );
      console.log("✅ Wallet built successfully");
      wallet.start();
    } catch (error) {
      console.error("❌ Error building wallet:", error);
      throw error;
    }
  }

  const state = await Rx.firstValueFrom(wallet.state());
  console.log(`Your wallet seed is: ${seed}`);
  console.log(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  if (balance === undefined || balance === 0n) {
    console.log(`Your wallet balance is: 0`);
    console.log(`Waiting to receive tokens...`);
    balance = await waitForFunds(wallet);
  }
  console.log(`Your wallet balance is: ${balance}`);
  return wallet;
};

const configureProviders = async (
  wallet: Wallet & Resource,
  config: Config,
) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet,
  );
  return {
    privateStateProvider: levelPrivateStateProvider<
      typeof CounterPrivateStateId
    >({
      privateStateStoreName: contractConfig.privateStateStoreName,
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider<"increment">(
      contractConfig.zkConfigPath,
    ),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/**
 * Get contract address from command line arguments or from a file
 */
const getContractAddress = async (): Promise<string> => {
  // First try to get from command line arguments
  const contractAddressFromArgs = Deno.args[0];

  if (contractAddressFromArgs) {
    console.log(
      `📋 Using contract address from arguments: ${contractAddressFromArgs}`,
    );
    return contractAddressFromArgs;
  }

  // If not provided via args, try to read from contract_address.txt file
  const contractAddressFile = resolve(currentDir, "contract.json");

  try {
    if (await exists(contractAddressFile)) {
      const contractAddressFromFile = JSON.parse(
        await Deno.readTextFile(contractAddressFile),
      ).contractAddress;

      if (contractAddressFromFile) {
        console.log(
          `📄 Using contract address from file ${contractAddressFile}: ${contractAddressFromFile}`,
        );
        return contractAddressFromFile;
      } else {
        throw new Error("Contract address file is empty");
      }
    } else {
      throw new Error(
        `Contract address file not found at ${contractAddressFile}`,
      );
    }
  } catch (error) {
    console.error(`❌ Error reading contract address from file: ${error}`);
    console.error("❌ Error: Contract address is required");
    console.error(
      "Usage: deno run --allow-all increment.ts <CONTRACT_ADDRESS>",
    );
    console.error(
      "Or create a contract_address.txt file with the contract address",
    );
    console.error(
      "Example: deno run --allow-all increment.ts 0x1234567890abcdef1234567890abcdef12345678",
    );
    Deno.exit(1);
  }
};

/**
 * Standalone script that joins a counter contract with a specific address and increments its value.
 *
 * Usage:
 *   deno run --allow-all increment.ts <CONTRACT_ADDRESS>
 *   or create a contract_address.txt file with the contract address
 *
 * Example:
 *   deno run --allow-all increment.ts 0x1234567890abcdef1234567890abcdef12345678
 */
async function joinAndIncrement(): Promise<void> {
  // Get contract address from command line arguments or file
  const contractAddress = await getContractAddress();

  console.log(
    `🚀 Starting join and increment process for contract: ${contractAddress}`,
  );

  // Initialize configuration
  const config = new StandaloneConfig();

  let wallet = null;

  try {
    console.log("🔗 Building wallet with genesis seed for standalone mode...");

    // Build wallet using genesis seed (which has initial funds in standalone mode)
    wallet = await buildWalletAndWaitForFunds(
      config,
      GENESIS_MINT_WALLET_SEED,
      "contract.json",
    );

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ Configuring providers...");
    const providers = await configureProviders(wallet, config);

    console.log("✅ Providers configured successfully");

    // Join the contract
    console.log(`🔗 Joining counter contract at address: ${contractAddress}`);
    const counterContract = await joinContract(providers, contractAddress);

    console.log("✅ Successfully joined the counter contract");

    // Display current counter value before increment
    console.log("📊 Displaying current counter value before increment...");
    const beforeResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 Current counter value: ${beforeResult.counterValue}`);

    // Increment the counter
    console.log("🔢 Incrementing counter...");
    const incrementResult = await increment(counterContract);

    console.log(
      `✅ Counter incremented successfully! Transaction ID: ${incrementResult.txId}`,
    );
    console.log(
      `✅ Counter incremented! Transaction: ${incrementResult.txId} in block ${incrementResult.blockHeight}`,
    );

    // Display counter value after increment
    console.log("📊 Displaying counter value after increment...");
    const afterResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 New counter value: ${afterResult.counterValue}`);

    console.log("🎉 Join and increment process completed successfully!");
  } catch (error) {
    console.error("❌ Error during join and increment process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    Deno.exit(1);
  } finally {
    // Clean up wallet
    if (wallet) {
      try {
        console.log("🧹 Wallet closed successfully");
        Deno.exit(0);
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
}

// Run the script if this file is executed directly
if (import.meta.main) {
  joinAndIncrement().catch((error) => {
    console.error("❌ Unhandled error:", error);
    Deno.exit(1);
  });
}

export { joinAndIncrement };
