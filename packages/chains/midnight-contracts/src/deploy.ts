import * as log from "@std/log";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  NetworkId,
  setNetworkId,
  getLedgerNetworkId,
  getZswapNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import {
  type BalancedTransaction,
  type MidnightProvider,
  type UnbalancedTransaction,
  type WalletProvider,
  createBalancedTx,
} from "@midnight-ntwrk/midnight-js-types";
import { type Resource, WalletBuilder } from "@midnight-ntwrk/wallet";
import { type Wallet } from "@midnight-ntwrk/wallet-api";
import {
  Transaction as ZswapTransaction,
} from "@midnight-ntwrk/zswap";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/ledger";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import * as path from "@std/path";
import * as Rx from "rxjs";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { findContractDirectoryForDeploy } from "./read-contract.ts";

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

/**
 * Configuration for deploying a Midnight contract
 */
export interface DeployConfig {
  /** Name of the contract directory (e.g., "contract-counter", "contract-eip-20") */
  contractName: string;
  /** Base filename for contract address (e.g., "contract-counter.json"); a network suffix is appended */
  contractFileName: string;
  /** The Contract class to deploy */
  contractClass: any;
  /** Witness definitions */
  witnesses: any;
  /** On-chain private state ID */
  privateStateId: string;
  /** Initial private state object */
  initialPrivateState: any;
  /** Optional deployment arguments array */
  deployArgs?: any[];
  /** Optional private state store name (defaults to contractName-based value) */
  privateStateStoreName?: string;
  /** Optional base directory override for finding contracts */
  baseDir?: string;
  /** Optional log directory path */
  logDir?: string;
  /** Optional flag to extract wallet address info (for contracts that need initialOwner) */
  extractWalletAddress?: boolean;
}

/**
 * Network endpoint URLs for connecting to Midnight infrastructure
 */
export interface NetworkUrls {
  /** GraphQL indexer HTTP endpoint (default: http://127.0.0.1:8088/api/v3/graphql)*/
  indexer?: string;
  /** GraphQL indexer WebSocket endpoint (default: ws://127.0.0.1:8088/api/v3/graphql/ws)*/
  indexerWS?: string;
  /** Midnight node RPC endpoint (default: http://127.0.0.1:9944)*/
  node?: string;
  /** Proof server HTTP endpoint (default: http://127.0.0.1:6300)*/
  proofServer?: string;
}

/**
 * Default network URLs for undeployed/local development
 */
export const DEFAULT_NETWORK_URLS: Required<NetworkUrls> = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state: any) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        log.info(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state: any) => {
        // Let's allow progress only if wallet is synced
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s: any) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance: bigint) => balance > 0n),
    ),
  );

interface InternalNetworkConfig extends Required<NetworkUrls> {
  logDir?: string;
}

const buildWalletAndWaitForFunds = async (
  config: InternalNetworkConfig,
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

  const state: any = await Rx.firstValueFrom(wallet.state());
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
  const state: any = await Rx.firstValueFrom(wallet.state());
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
  config: InternalNetworkConfig,
  privateStateStoreName: string,
  zkConfigPath: string,
) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet,
  );
  return {
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: "midnight-level-db-deploy", // Use separate DB for deployment to avoid lock conflicts
      privateStateStoreName,
      walletProvider: walletAndMidnightProvider, // Use wallet's encryption key for private state
    } as any), // Type assertion: runtime supports walletProvider even though types don't reflect it yet
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/**
 * Deploys a Midnight contract using the provided configuration.
 * 
 * This function is context-aware and will find the contract directory
 * and zkConfigPath automatically using readMidnightContract.
 * 
 * @param config - Deployment configuration
 * @param networkUrls - Optional network endpoint URLs (defaults to local undeployed endpoints)
 * @returns The deployed contract address
 */
export async function deployMidnightContract(
  config: DeployConfig,
  networkUrls?: NetworkUrls,
): Promise<string> {
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

  // Find the contract directory (don't require contract file to exist during deployment)
  const contractDir = findContractDirectoryForDeploy(
    config.contractName,
    config.baseDir,
  );
  
  if (!contractDir) {
    throw new Error(
      `Could not find Midnight contract directory for "${config.contractName}". ` +
      `Searched starting from ${config.baseDir || Deno.cwd()}. ` +
      `Please ensure you're running from a directory that contains or is a parent of the Midnight contract directory, ` +
      `or provide an explicit baseDir parameter.`
    );
  }
  
  // Find the compiler subdirectory to determine zkConfigPath
  const managedDir = path.join(contractDir, config.contractName, "src/managed");
  let compilerSubdir = "";
  try {
    for (const entry of Deno.readDirSync(managedDir)) {
      if (entry.isDirectory) {
        compilerSubdir = entry.name;
        break;
      }
    }
  } catch (error) {
    throw new Error(`Managed directory not found: ${managedDir}`);
  }
  
  if (!compilerSubdir) {
    throw new Error(`No subdirectory found in managed directory: ${managedDir}`);
  }
  
  const zkConfigPath = path.resolve(
    path.join(contractDir, config.contractName, "src/managed", compilerSubdir)
  );
  
  // Use the directory where the contract directory is located for output
  const outputBaseDir = contractDir;

  // Default private state store name if not provided
  const privateStateStoreName = config.privateStateStoreName ?? 
    `${config.contractName.replace("contract-", "")}-private-state`;

  // Merge network URLs with defaults and add logDir from config
  const networkConfig: InternalNetworkConfig = {
    ...(DEFAULT_NETWORK_URLS),
    ...(networkUrls ?? {}),
    logDir: config.logDir,
  };

  setNetworkId(NetworkId.Undeployed);

  let wallet: (Wallet & Resource) | null = null;
  let providers: Awaited<ReturnType<typeof configureProviders>> | null = null;

  try {
    log.info("Building wallet...");
    wallet = await buildWalletAndWaitForFunds(
      networkConfig,
      GENESIS_MINT_WALLET_SEED,
    );

    // Extract wallet address info if needed (for contracts like EIP-20)
    let deployArgs = config.deployArgs;
    if (config.extractWalletAddress && deployArgs) {
      const state: any = await Rx.firstValueFrom(wallet.state());
      const walletAddress = state.address;
      log.info(`Wallet address: ${walletAddress}`);
      const decodedAddress = MidnightBech32m.parse(walletAddress);
      const shieldedAddress = ShieldedAddress.codec.decode(
        "undeployed",
        decodedAddress,
      );
      console.log("coin Public Key:", shieldedAddress.coinPublicKeyString());
      console.log(
        "encryption Public Key:",
        shieldedAddress.encryptionPublicKeyString(),
      );
      const initialOwner = {
        is_left: true,
        left: { bytes: shieldedAddress.coinPublicKey.data },
        right: { bytes: new Uint8Array(32) },
      };
      
      // Replace the last argument with initialOwner if deployArgs exists
      if (deployArgs && deployArgs.length > 0) {
        deployArgs = [...deployArgs.slice(0, -1), initialOwner];
      }
    }

    log.info("Wallet built successfully.");

    // Use a separate LevelDB directory for deployment to avoid lock conflicts with batcher
    const deployPrivateStateStoreName = `${privateStateStoreName}-deploy`;
    
    log.info("Configuring providers...");
    providers = await configureProviders(
      wallet,
      networkConfig,
      deployPrivateStateStoreName,
      zkConfigPath,
    );
    log.info("Providers configured.");

    log.info("Deploying contract...");
    const contract = new config.contractClass(config.witnesses);
    
    // deployContract has different overloads - build options object conditionally
    const deployOptions: any = {
      contract: contract,
      privateStateId: config.privateStateId,
      initialPrivateState: config.initialPrivateState,
    };
    
    // Only include args if they are provided
    if (deployArgs && deployArgs.length > 0) {
      deployOptions.args = deployArgs;
    }
    
    const deployedContract = await deployContract(providers, deployOptions);
    log.info("Contract deployed.");

    const contractAddress =
      deployedContract.deployTxData.public.contractAddress;
    console.log(contractAddress);
    
    // Determine output path - use the directory where contract file was found
    const resolvedNetworkId = NetworkId.Undeployed;
    const baseContractFileName =
      config.contractFileName ?? `${config.contractName}.json`;
    const { dir: contractFileDir, name: contractFileBaseName, ext: contractFileExt } =
      path.parse(baseContractFileName);
    const normalizedExt = contractFileExt || ".json";
    const networkSuffix = `.${resolvedNetworkId}`;
    const fileBaseWithNetwork =
      contractFileBaseName.endsWith(networkSuffix)
        ? contractFileBaseName
        : `${contractFileBaseName}${networkSuffix}`;
    const outputFileName = `${fileBaseWithNetwork}${normalizedExt}`;
    const outputPath = path.join(
      outputBaseDir,
      contractFileDir,
      outputFileName,
    );

    await Deno.writeTextFile(
      outputPath,
      JSON.stringify({ contractAddress }, null, 2),
    );
    log.info(`Contract address saved to ${outputPath} (network: ${resolvedNetworkId})`);
    
    return contractAddress;
  } catch (e) {
    if (e instanceof Error) {
      log.error(`Deployment failed: ${e.message}`);
      log.debug(e.stack);
    } else {
      log.error("An unknown error occurred during deployment.");
    }
    throw e;
  } finally {
    if (wallet) {
      log.info("Closing wallet...");
      log.info("Wallet closed.");
    }
    
    // Wait a moment for Level DB to finish any async close operations
    // The levelPrivateStateProvider opens/closes DB for each operation in withSubLevel
    // But there might be pending async operations
    log.info("Waiting for Level DB cleanup...");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

