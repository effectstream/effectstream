import {
  type ContractAddress,
  NetworkId,
} from "@midnight-ntwrk/compact-runtime";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "@example/my-midnight-contract";
import {
  type CoinInfo,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/ledger";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnbalancedTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { type Resource, WalletBuilder } from "@midnight-ntwrk/wallet";
import type { Wallet } from "@midnight-ntwrk/wallet-api";
import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
import * as Rx from "rxjs";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "node:path";
import {
  BASE_URL_MIDNIGHT_INDEXER_API,
  BASE_URL_MIDNIGHT_INDEXER_WS,
  BASE_URL_MIDNIGHT_NODE,
  BASE_URL_PROOF_SERVER,
} from "./config.ts";

// Inlined common types for standalone script
type CounterCircuits = ImpureCircuitId<Counter.Contract<CounterPrivateState>>;

const CounterPrivateStateId = "counterPrivateState";

type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof CounterPrivateStateId,
  CounterPrivateState
>;

type CounterContract = Counter.Contract;

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
  indexer = BASE_URL_MIDNIGHT_INDEXER_API;
  indexerWS = BASE_URL_MIDNIGHT_INDEXER_WS;
  node = BASE_URL_MIDNIGHT_NODE;
  proofServer = BASE_URL_PROOF_SERVER;
  constructor() {
    setNetworkId("Undeployed" as any);
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
    const state = contractState != null
      ? Counter.ledger(contractState.data).round
      : null;
    console.log(`📊 Ledger state: ${state}`);
    return state;
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
  contractAddress: string,
  tokenId: string,
  propertyName: string,
  propertyValue: string,
): Promise<FinalizedTxData> => {
  console.log("Incrementing...");

  console.log(`📝 Using parameters:`);
  console.log(`   Contract Address: ${contractAddress}`);
  console.log(`   Token ID: ${tokenId}`);
  console.log(`   Property Name: ${propertyName}`);
  console.log(`   Property Value: ${propertyValue}`);

  const toEncodedString = (str: string, length = 32) =>
    Uint8Array.from(
      str.padEnd(length, " ").split("").map((c) => c.charCodeAt(0)),
    );
  const finalizedTxData = await counterContract.callTx.increment(
    toEncodedString(contractAddress, 64),
    toEncodedString(tokenId, 64),
    toEncodedString(propertyName, 32),
    toEncodedString(propertyValue, 32),
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

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
  filename: string,
): Promise<Wallet & Resource> => {
  const wallet = await WalletBuilder.buildFromSeed(
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

  // Wait for wallet to be initialized with a timeout
  console.log("🔄 Waiting for wallet to initialize...");
  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.timeout(30000), // 30 second timeout
      Rx.tap((state: any) => {
        console.log("🔗 [WALLET] Wallet state received:", {
          address: state.address,
          synced: state.syncProgress?.synced,
          balanceCount: Object.keys(state.balances || {}).length,
        });
      }),
    ),
  );

  console.log(`✅ Wallet initialized with address: ${state.address}`);
  return wallet as any;
};

const configureProviders = async (
  wallet: Wallet & Resource,
  config: Config,
) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet,
  );

  const privateStateProvider = levelPrivateStateProvider<
    typeof CounterPrivateStateId
  >({
    privateStateStoreName: contractConfig.privateStateStoreName,
  });

  const publicDataProvider = indexerPublicDataProvider(
    config.indexer,
    config.indexerWS,
  );

  const zkConfigPath = window.location.origin;

  const zkConfigProvider = new FetchZkConfigProvider(
    zkConfigPath,
    fetch.bind(window),
  );
  const proofProvider = httpClientProofProvider(config.proofServer);

  const providers: CounterProviders = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
  return providers;
};

/**
 * Get contract address from command line arguments or from a file
 */
const getContractAddress = async (): Promise<string> => {
  const r = await fetch("contract_address/contract.json");
  const json = await r.json();
  console.log("🔍 Contract address:", json.contractAddress);
  return json.contractAddress;
};

// Separate functions for Web App use
let globalWallet: (Wallet & Resource) | null = null;
let globalProviders: CounterProviders | null = null;
let globalCounterContract: DeployedCounterContract | null = null;

const connectMidnightWallet = async (): Promise<{
  wallet: Wallet & Resource;
  providers: CounterProviders;
}> => {
  console.log("🔗 Building Midnight wallet with genesis seed...");

  const config = new StandaloneConfig();
  const wallet = await buildWalletAndWaitForFunds(
    config,
    GENESIS_MINT_WALLET_SEED,
    "contract.json",
  );

  console.log("✅ Midnight wallet built successfully");

  const providers = await configureProviders(wallet, config);
  console.log("✅ Providers configured successfully");

  // Store globally for later use
  globalWallet = wallet;
  globalProviders = providers;

  return { wallet, providers };
};

const connectToContract = async (
  providers: CounterProviders,
  contractAddress?: string,
): Promise<{
  counterContract: DeployedCounterContract;
  currentState: { counterValue: bigint | null; contractAddress: string };
}> => {
  const address = contractAddress || await getContractAddress();
  console.log(`🔗 Joining counter contract at address: ${address}`);

  const counterContract = await joinContract(providers, address);
  console.log("✅ Successfully joined the counter contract");

  // Get initial state
  const currentState = await displayCounterValue(providers, counterContract);
  console.log(`📊 Current counter value: ${currentState.counterValue}`);

  // Store globally for later use
  globalCounterContract = counterContract;

  return { counterContract, currentState };
};

const fetchCurrentCounterState = async (
  providers?: CounterProviders,
  counterContract?: DeployedCounterContract,
): Promise<{ counterValue: bigint | null; contractAddress: string }> => {
  const actualProviders = providers || globalProviders;
  const actualContract = counterContract || globalCounterContract;

  if (!actualProviders || !actualContract) {
    throw new Error("Providers and contract must be initialized first");
  }

  return await displayCounterValue(actualProviders, actualContract);
};

const incrementCounterValue = async (
  contractAddress: string,
  tokenId: string,
  propertyName: string,
  propertyValue: string,
  counterContract?: DeployedCounterContract,
): Promise<FinalizedTxData> => {
  const actualContract = counterContract || globalCounterContract;

  if (!actualContract) {
    throw new Error("Contract must be joined first");
  }

  console.log("🔢 Incrementing counter...");
  const result = await increment(
    actualContract,
    contractAddress,
    tokenId,
    propertyName || "",
    propertyValue || "",
  );
  console.log(
    `✅ Counter incremented successfully! Transaction ID: ${result.txId}`,
  );

  return result;
};

export {
  connectMidnightWallet,
  connectToContract,
  fetchCurrentCounterState,
  incrementCounterValue,
};
