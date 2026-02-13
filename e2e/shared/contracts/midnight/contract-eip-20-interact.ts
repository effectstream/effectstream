import {
  type ContractAddress,
  NetworkId,
} from "npm:@midnight-ntwrk/compact-runtime";
import {
  SimpleToken,
  witnesses,
} from "./contract-eip-20/src/index.original.ts";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "npm:@midnight-ntwrk/ledger";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "npm:@midnight-ntwrk/wallet-sdk-address-format";
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
import { levelPrivateStateProvider } from "npm:@midnight-ntwrk/midnight-js-level-private-state-provider";
import * as Rx from "npm:rxjs";
import { assertIsContractAddress } from "npm:@midnight-ntwrk/midnight-js-utils";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  setNetworkId,
} from "npm:@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "@std/path";
import { exists } from "@std/fs";
import { getEnv, args, exit } from "@effectstream/utils/runtime";
import { readFile, readTextFile } from "node:fs/promises";

globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type SimpleTokenCircuits = ImpureCircuitId<SimpleToken.Contract>;

const SimpleTokenPrivateStateId = "simpleTokenPrivateState";

type SimpleTokenProviders = MidnightProviders<
  SimpleTokenCircuits,
  typeof SimpleTokenPrivateStateId,
  SimpleToken.Contract.PrivateState
>;

type SimpleTokenContract = SimpleToken.Contract;

type DeployedSimpleTokenContract =
  | DeployedContract<SimpleTokenContract>
  | FoundContract<SimpleTokenContract>;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  indexer = midnightNetworkConfig.indexer;
  indexerWS = midnightNetworkConfig.indexerWS;
  node = midnightNetworkConfig.node;
  proofServer = midnightNetworkConfig.proofServer;
  constructor() {
    setNetworkId(midnightNetworkConfig.id as NetworkId);
  }
}

const config = new StandaloneConfig();

const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

const contractConfig = {
  privateStateStoreName: "counter-private-state",
  zkConfigPath: resolve(
    currentDir,
    "contract-eip-20",
    "src",
    "managed",
    "simpletoken",
  ),
};

import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const contractNetworkId = midnightNetworkConfig.id ?? "undeployed";
const contractAddressFileName = `contract-eip-20.${contractNetworkId}.json`;

/**
 * Default wallet seed.
 * In the case of the undeployed (local) network, this is the genesis seed that has initial funds.
 */
const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;

const simpleTokenContractInstance: SimpleTokenContract = new SimpleToken
  .Contract(
  witnesses,
);

const getSimpleTokenLedgerState = async (
  providers: SimpleTokenProviders,
  contractAddress: ContractAddress,
): Promise<bigint | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state = contractState != null
      ? SimpleToken.ledger(contractState.data)
      : null;
    console.log(
      `📊 Ledger state: ${
        state && JSON.stringify(
          state,
          (_key, value) => typeof value === "bigint" ? value.toString() : value,
          2,
        )
      }`,
    );
    return state;
  } catch (error) {
    console.error("❌ Error getting simple token ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: SimpleTokenProviders,
  contractAddress: string,
): Promise<DeployedSimpleTokenContract> => {
  console.log("Joining contract...🍋🍋🍋");
  const simpleTokenContract = await findDeployedContract(providers, {
    contractAddress,
    contract: simpleTokenContractInstance,
    privateStateId: "simpleTokenPrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${simpleTokenContract.deployTxData.public.contractAddress}`,
  );
  return simpleTokenContract;
};

const balanceOf = async (
  simpleTokenContract: DeployedSimpleTokenContract,
  account: string,
): Promise<bigint> => {
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(account),
  );
  const either = {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
  const accountBalance = await simpleTokenContract.callTx.balanceOf(either);
  return accountBalance.private.result as bigint;
};

const mint = async (
  simpleTokenContract: DeployedSimpleTokenContract,
  account: string,
  value: bigint,
): Promise<FinalizedTxData> => {
  console.log("Minting...");
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(account),
  );
  const either = {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
  const finalizedTxData = await simpleTokenContract.callTx.mint(either, value);
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log(`Minted ${value} tokens to ${account}`);
  return finalizedTxData.public;
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
      Rx.filter((balance: bigint) => balance > 0n),
    ),
  );

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
  filename: string,
): Promise<Wallet & Resource> => {
  const directoryPath = getEnv("SYNC_CACHE");
  let wallet: Wallet & Resource;
  if (directoryPath !== undefined) {
    const fullPath = `${directoryPath}/${filename}`;
    if (await exists(fullPath)) {
      console.log(
        `Attempting to restore state from ${fullPath}`,
      );
      try {
        const serialized = await readFile(fullPath);
        wallet = await WalletBuilder.restore(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          serialized.toString(),
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
      wallet = await WalletBuilder.build(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        NetworkId.Undeployed,
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
    // Old SDK: Empty config works fine - avoids historical private state sync
    privateStateProvider: levelPrivateStateProvider({}),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider<"mint">(
      contractConfig.zkConfigPath,
    ),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

const getContractAddress = async (): Promise<string> => {
  // First try to get from command line arguments
  // const contractAddressFromArgs = args()[0];

  // if (contractAddressFromArgs) {
  //   console.log(
  //     `📋 Using contract address from arguments: ${contractAddressFromArgs}`,
  //   );
  //   return contractAddressFromArgs;
  // }

  // If not provided via args, try to read from contract_address.txt file
  const contractAddressFile = resolve(currentDir, contractAddressFileName);

  try {
    if (await exists(contractAddressFile)) {
      const contractAddressFromFile = JSON.parse(
        await readTextFile(contractAddressFile, "utf-8"),
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
    exit(1);
  }
};

async function joinAndMint(account: string, amount: bigint): Promise<void> {
  // Get contract address from command line arguments or file
  const contractAddress = await getContractAddress();

  console.log(
    `🚀 Starting join and mint process for contract: ${contractAddress}`,
  );

  // Initialize configuration
  const config = new StandaloneConfig();

  let wallet = null;

  try {
    console.log("🔗 Building wallet with default wallet seed...");

    // Build wallet using default wallet seed (genesis seed in standalone mode)
    wallet = await buildWalletAndWaitForFunds(
      config,
      DEFAULT_WALLET_SEED,
      contractAddressFileName,
    );

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ Configuring providers...");
    const providers = await configureProviders(wallet, config);

    console.log("✅ Providers configured successfully");

    // Join the contract
    console.log(
      `🔗 Joining simple token contract at address: ${contractAddress}`,
    );
    const simpleTokenContract = await joinContract(providers, contractAddress);

    console.log("✅ Successfully joined the simple token contract");

    // Increment the counter
    console.log("🔢 Minting simple token...");
    const incrementResult = await mint(simpleTokenContract, account, amount);

    console.log(
      `✅ Simple token minted successfully! Transaction ID: ${incrementResult.txId}`,
    );
    console.log(
      `✅ Simple token minted! Transaction: ${incrementResult.txId} in block ${incrementResult.blockHeight}`,
    );

    const accountBalance = await balanceOf(simpleTokenContract, account);
    console.log(
      `Account balance: ${String(accountBalance)}`,
    );
    // Display simple token value after increment
    await getSimpleTokenLedgerState(providers, contractAddress);

    console.log("🎉 Join and mint process completed successfully!");
  } catch (error) {
    console.error("❌ Error during join and mint process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    exit(1);
  } finally {
    // Clean up wallet
    if (wallet) {
      try {
        console.log("🧹 Wallet closed successfully");
        exit(0);
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
}

// Run the script if this file is executed directly
if (import.meta.main) {
  const wallet = await WalletBuilder.build(
    config.indexer,
    config.indexerWS,
    config.proofServer,
    config.node,
    DEFAULT_WALLET_SEED,
    midnightNetworkConfig.id as any,
  );
  const address = (await Rx.firstValueFrom(wallet.state())).address;
  joinAndMint(address, 20000n).catch((error) => {
    console.error("❌ Unhandled error:", error);
    exit(1);
  });
}

export { joinAndMint };
