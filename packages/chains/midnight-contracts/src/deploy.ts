// TODO Remove references to "src/managed" as this is not standard.

// Single WASM instance for ContractState / ContractMaintenanceAuthority.
import "@midnightntwrk/onchain-runtime-v4";

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import { statSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { getEnv, cwd } from "@effectstream/utils/runtime";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { PrivateStateId } from "@midnight-ntwrk/midnight-js-types";
import { CompiledContract, type Witnesses, type Contract } from "@midnight-ntwrk/compact-js";
import type { SigningKey } from "@midnightntwrk/ledger-v9";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import * as path from "node:path";

const log = console;

import { findContractDirectoryForDeploy } from "./read-contract.ts";
import { mnemonicToSeed } from "./mnemonicToSeed.ts";
import type { NetworkUrls, DeployConfig, WalletResult } from "./types.ts";
import { buildWalletAndWaitForFunds, extractInitialOwnerFromWallet } from "./build-wallet.ts";
import { configureMidnightNodeProviders } from "./providers.ts";
import { deployMidnightContractPhased } from "./deploy-phased.ts";
import { midnightNetworkConfig } from "./midnight-env.ts";

function checkEnvVariables(): void {
  if (!getEnv("MIDNIGHT_STORAGE_PASSWORD")) {
    throw new Error(
      "MIDNIGHT_STORAGE_PASSWORD is not set (Use a 16 char string)",
    );
  }
}

/**
 * Find the compiler subdirectory in the managed directory
 */
function hasManagedArtifacts(dir: string): boolean {
  const requiredDirs = ["contract", "compiler"];
  try {
    return requiredDirs.every((name) => {
      const stats = statSync(path.join(dir, name));
      return stats.isDirectory();
    });
  } catch {
    return false;
  }
}

function findCompilerSubdirectory(managedDir: string): string {
  // Check the managed directory itself first before looking at subdirectories.
  // This prevents accidentally picking a nested sub-contract (e.g. counter/)
  // that only contains a subset of the circuit keys.
  if (hasManagedArtifacts(managedDir)) {
    return "";
  }

  try {
    for (const entry of readdirSync(managedDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(managedDir, entry.name);
      if (hasManagedArtifacts(candidate)) {
        return entry.name;
      }
    }
  } catch (_error) {
    throw new Error(`Managed directory not found: ${managedDir}`);
  }

  throw new Error(
    `No compiler artifacts found in managed directory: ${managedDir}. ` +
      `Ensure the directory contains compiler, contract, keys, and zkir assets.`,
  );
}

// ============================================================================
// Main Deployment Function
// ============================================================================

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
  seedOrMnemonic?: { seed: string; mnemonic: string },
  opts?: { walletResult?: WalletResult },
): Promise<string> {
  checkEnvVariables();

  // Find the contract directory
  const contractDir = findContractDirectoryForDeploy(
    config.contractName,
    config.baseDir,
  );

  if (!contractDir) {
    throw new Error(
      `Could not find Midnight contract directory for "${config.contractName}". ` +
        `Searched starting from ${config.baseDir || cwd()}. ` +
        `Please ensure you're running from a directory that contains or is a parent of the Midnight contract directory, ` +
        `or provide an explicit baseDir parameter.`,
    );
  }

  // Find the compiler subdirectory to determine zkConfigPath
  const managedDir = path.join(contractDir, config.contractName, "src/managed");
  const compilerSubdir = findCompilerSubdirectory(managedDir);

  const zkConfigPath = path.resolve(
    path.join(contractDir, config.contractName, "src/managed", compilerSubdir),
  );

  // Default private state store name if not provided
  const privateStateStoreName =
    config.privateStateStoreName ??
    `${config.contractName.replace("contract-", "")}-private-state`;

  // Merge network URLs with defaults
  const { id: networkIdOverride, ...endpoints } = networkUrls ?? {};
  const resolvedNetworkId = (networkIdOverride ??
    midnightNetworkConfig.id) as NetworkId.NetworkId;
  const resolvedNetworkUrls: Required<NetworkUrls> = {
    id: resolvedNetworkId,
    indexer: endpoints.indexer ?? midnightNetworkConfig.indexer,
    indexerWS: endpoints.indexerWS ?? midnightNetworkConfig.indexerWS,
    node: endpoints.node ?? midnightNetworkConfig.node,
    proofServer: endpoints.proofServer ?? midnightNetworkConfig.proofServer,
  };

  log.info(
    `Preflight resolved endpoints -> indexerHttp=${resolvedNetworkUrls.indexer}, indexerWs=${resolvedNetworkUrls.indexerWS}, node=${resolvedNetworkUrls.node}, proofServer=${resolvedNetworkUrls.proofServer}, networkId=${resolvedNetworkId}`,
  );

  setNetworkId(resolvedNetworkId);

  let walletResult: WalletResult | null = opts?.walletResult ?? null;
  let providers: Awaited<ReturnType<typeof configureMidnightNodeProviders>> | null = null;

  try {
    if (!walletResult) {
      log.info("Building wallet...");
      let seed;
      if (seedOrMnemonic?.seed) {
        seed = seedOrMnemonic.seed;
      } else if (seedOrMnemonic?.mnemonic) {
        seed = Buffer.from(
          await mnemonicToSeed(seedOrMnemonic.mnemonic),
        ).toString("hex");
      } else {
        seed = midnightNetworkConfig.walletSeed;
      }
      if (!seed) {
        throw new Error("No seed or mnemonic provided");
      }

      walletResult = await buildWalletAndWaitForFunds(
        resolvedNetworkUrls,
        seed,
        resolvedNetworkId,
      );
    }

    const {
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      dustAddress,
      unshieldedKeystore,
    } = walletResult!;
    const resolvedDustReceiverAddress =
      getEnv("MIDNIGHT_DUST_RECEIVER_ADDRESS") ?? dustAddress;
    if (resolvedDustReceiverAddress === dustAddress) {
      log.info(`Using derived dust address: ${resolvedDustReceiverAddress}`);
    } else {
      log.info(
        `Using dust receiver address from MIDNIGHT_DUST_RECEIVER_ADDRESS: ${resolvedDustReceiverAddress}`,
      );
    }

    // Extract wallet address info if needed (for contracts like EIP-20)
    let deployArgs = config.deployArgs;
    if (config.extractWalletAddress && deployArgs && deployArgs.length > 0) {
      const initialOwner = await extractInitialOwnerFromWallet(wallet);
      deployArgs = [...deployArgs.slice(0, -1), initialOwner];
    }

    log.info("Wallet built successfully.");

    log.info("Configuring providers...");
    // Use a separate LevelDB directory for deployment to avoid lock conflicts with batcher
    const deployPrivateStateStoreName = `${privateStateStoreName}-deploy`;

    providers = await configureMidnightNodeProviders(
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      resolvedNetworkUrls,
      deployPrivateStateStoreName,
      zkConfigPath,
      unshieldedKeystore,
    );
    log.info("Providers configured.");

    log.info("Deploying contract...");

    // Apply defaults so callers only pass what their contract needs. Only
    // contractName and contractClass are truly required; everything else has a
    // sensible default.
    const resolvedConfig: DeployConfig = {
      ...config,
      contractFileName: config.contractFileName ?? `${config.contractName}.json`,
      witnesses: config.witnesses ?? {},
      privateStateId: config.privateStateId ?? "privateState",
      initialPrivateState: config.initialPrivateState ?? {},
    };

    // First, create the compiled contract
    const MyCompiledContract = CompiledContract.make(
      resolvedConfig.contractName,
      resolvedConfig.contractClass,
    ).pipe(
      CompiledContract.withWitnesses(resolvedConfig.witnesses as never),
      CompiledContract.withCompiledFileAssets(managedDir),
    );

    let contractAddress: string;
    if (resolvedConfig.phasedVerifierKeys) {
      // Opt-in path for contracts with too many circuits to deploy in a single
      // transaction: deploy with no verifier keys, then insert each circuit's
      // key one transaction at a time.
      log.info("Phased verifier-key deployment enabled.");
      contractAddress = await deployMidnightContractPhased(
        providers,
        MyCompiledContract,
        resolvedConfig,
        deployArgs,
        walletResult,
        zkConfigPath,
      );
      log.info("Contract deployed (phased).");
    } else {
      const deployOptions: {
        compiledContract: CompiledContract.CompiledContract<
          Contract<undefined, Witnesses<undefined>>,
          undefined,
          never
        >;
        privateStateId: PrivateStateId;
        initialPrivateState: Contract.PrivateState<any>;
        signingKey?: SigningKey;
        args: Contract.InitializeParameters<any>;
      } = {
        compiledContract: MyCompiledContract as any,
        privateStateId: resolvedConfig.privateStateId as PrivateStateId,
        initialPrivateState:
          resolvedConfig.initialPrivateState as Contract.PrivateState<any>,
        args: (deployArgs && deployArgs.length > 0
          ? deployArgs
          : []) as Contract.InitializeParameters<any>,
        signingKey: undefined,
      };

      const deployedContract = await deployContract(providers, deployOptions);
      log.info("Contract deployed.");
      contractAddress = deployedContract.deployTxData.public.contractAddress;
    }
    log.info(`Contract address: ${contractAddress}`);

    const baseContractFileName =
      resolvedConfig.contractFileName ?? `${config.contractName}.json`;
    const {
      dir: contractFileDir,
      name: contractFileBaseName,
      ext: contractFileExt,
    } = path.parse(baseContractFileName);
    const normalizedExt = contractFileExt || ".json";
    const networkSuffix = `.${resolvedNetworkId}`;
    const fileBaseWithNetwork = contractFileBaseName.endsWith(networkSuffix)
      ? contractFileBaseName
      : `${contractFileBaseName}${networkSuffix}`;
    const outputFileName = `${fileBaseWithNetwork}${normalizedExt}`;
    const outputPath = path.join(contractDir, contractFileDir, outputFileName);

    await writeFile(outputPath, JSON.stringify({ contractAddress }, null, 2));
    log.info(
      `Contract address saved to ${outputPath} (network: ${resolvedNetworkId})`,
    );

    return contractAddress;
  } catch (e) {
    if (e instanceof Error) {
      log.error(`Deployment failed: ${e.message}`);
      log.error(e.stack);
    } else {
      log.error("An unknown error occurred during deployment.");
    }
    throw e;
  } finally {
    // Close wallet first
    if (walletResult) {
      log.info("Closing wallet...");
      try {
        await walletResult.wallet.stop();
      } catch (_closeError) {
        // Ignore close errors
      }
      log.info("Wallet closed.");
    }

    // Wait a moment for Level DB to finish any async close operations
    // The levelPrivateStateProvider opens/closes DB for each operation in withSubLevel
    // But there might be pending async operations
    log.info("Waiting for Level DB cleanup...");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
