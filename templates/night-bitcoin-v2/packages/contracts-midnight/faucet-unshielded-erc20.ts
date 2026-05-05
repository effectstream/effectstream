const log = { info: console.log, warn: console.warn, error: console.error };
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { type MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import {
  shieldedToken,
} from "@midnight-ntwrk/ledger-v8";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import {
  buildWalletFacade,
  getInitialShieldedState,
  syncAndWaitForFunds,
  registerNightForDust,
  configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";
import type { WalletResult } from "@effectstream/midnight-contracts/types";
import {
  SimpleToken,
  witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";

globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type SimpleTokenCircuits = any;

const SimpleTokenPrivateStateId = "simpleTokenPrivateState";

type SimpleTokenProviders = MidnightProviders<
  SimpleTokenCircuits,
  typeof SimpleTokenPrivateStateId,
  any
>;

type SimpleTokenContract = SimpleToken.Contract;

type DeployedSimpleTokenContract =
  | DeployedContract<any>
  | FoundContract<any>;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

// ============================================================================
// Constants
// ============================================================================

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000001";

const simpleTokenContractInstance: SimpleTokenContract = new SimpleToken
  .Contract(
  witnesses,
);

// Re-export the SDK type so consumers (e.g. mint-wallets.ts) keep working.
export type { WalletResult };

// Re-export for backward compatibility with previous imports of these helpers.
export { buildWalletFacade, getInitialShieldedState, syncAndWaitForFunds };

// ============================================================================
// Configuration
// ============================================================================

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v3/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v3/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId(NetworkId.NetworkId.Undeployed);
  }
}

const config = new StandaloneConfig();

const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

const contractConfig = {
  privateStateStoreName: "unshielded-erc20-private-state",
  zkConfigPath: resolve(
    currentDir,
    "unshielded-erc20",
    "src",
    "managed",
    "unshielded-erc20",
  ),
};

// ============================================================================
// Contract Functions
// ============================================================================

const joinContract = async (
  providers: SimpleTokenProviders,
  contractAddress: string,
): Promise<DeployedSimpleTokenContract> => {
  console.log("Joining contract...🍋🍋🍋");
  const simpleTokenContract = await findDeployedContract(providers, {
    contractAddress,
    contract: simpleTokenContractInstance as any,
    privateStateId: "simpleTokenPrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${simpleTokenContract.deployTxData.public.contractAddress}`,
  );
  return simpleTokenContract;
};

const wrapAddress = (address: string): any => {
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(address),
  );

  return {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
};

const mint = async (
  simpleTokenContract: DeployedSimpleTokenContract,
  account: string,
  value: bigint,
): Promise<any> => {
  console.log(`Minting ${value} tokens to ${account}...`);

  const either = wrapAddress(account);
  const finalizedTxData = await (simpleTokenContract.callTx as any).mint(either, value);
  console.log(
     `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log( `Minted ${value} tokens to ${account}`);
  return finalizedTxData.public;
};

// ============================================================================
// Provider Functions
// ============================================================================

const configureProviders = async (
  walletResult: WalletResult,
  cfg: Config,
): Promise<SimpleTokenProviders> => {
  const networkUrls = {
    indexer: cfg.indexer,
    indexerWS: cfg.indexerWS,
    node: cfg.node,
    proofServer: cfg.proofServer,
  };
  // Use the SDK's provider builder. It implements the v2.x WalletProvider
  // interface (`balanceTx` returns FinalizedTransaction, etc.) using the
  // new transferTransaction / signRecipe / finalizeRecipe / submitTransaction flow.
  return configureMidnightNodeProviders(
    walletResult.wallet,
    walletResult.zswapSecretKeys,
    walletResult.walletZswapSecretKeys,
    walletResult.dustSecretKey,
    walletResult.walletDustSecretKey,
    networkUrls,
    contractConfig.privateStateStoreName,
    contractConfig.zkConfigPath,
    walletResult.unshieldedKeystore,
  ) as unknown as SimpleTokenProviders;
};

const getContractAddress = async (): Promise<string> => {
  const contractAddressFile = resolve(currentDir, "unshielded-erc20.undeployed.json");

  try {
      const contractAddressFromFile = JSON.parse(
        await readFile(contractAddressFile, "utf-8"),
      ).contractAddress;

        console.log(
          `📄 Using contract address from file ${contractAddressFile}: ${contractAddressFromFile}`,
        );
        return contractAddressFromFile;

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
    throw error;
  }
};

// ============================================================================
// Main Function
// ============================================================================

async function joinAndMint(accounts: string | string[], amount: bigint): Promise<boolean> {

  const targets = Array.isArray(accounts) ? accounts : [accounts];
  const networkUrls = {
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    proofServer: config.proofServer,
  };

  let wallet: WalletFacade | null = null;

  try {
      // Get contract address from command line arguments or file
  const contractAddress = await getContractAddress();

  console.log(
    `🚀 Starting join and mint process for contract: ${contractAddress}`,
  );

    console.log("🔗 Building wallet with genesis seed for standalone mode...");

    // Build wallet using genesis seed (which has initial funds in standalone mode)
    const walletResult = await buildWalletFacade(
      networkUrls,
      GENESIS_MINT_WALLET_SEED,
      NetworkId.NetworkId.Undeployed,
    );
    wallet = walletResult.wallet;
    console.log("✅ Wallet built successfully");

    const initialState = await getInitialShieldedState(wallet.shielded);
    console.log(`Your master wallet seed is: ${GENESIS_MINT_WALLET_SEED}`);
    console.log(`Your master wallet address is: ${initialState.address.coinPublicKeyString()}`);

    const { shieldedBalance, unshieldedBalance, dustBalance } = await syncAndWaitForFunds(wallet, {
      waitNonZero: true,
    });
    console.log(`Shielded balance: ${shieldedBalance}`);
    console.log(`Unshielded balance: ${unshieldedBalance}`);
    console.log(`Dust balance: ${dustBalance}`);

    // Make sure dust is available for paying tx fees: register Night UTXOs if needed.
    if (dustBalance === 0n && unshieldedBalance > 0n) {
      try {
        await registerNightForDust(walletResult);
      } catch (e) {
        log.warn(`registerNightForDust failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ Configuring providers...");
    const providers = await configureProviders(walletResult, config);

    console.log("✅ Providers configured successfully");

    // Join the contract
    console.log(
      `🔗 Joining simple token contract at address: ${contractAddress}`,
    );
    const simpleTokenContract = await joinContract(providers, contractAddress);

    console.log("✅ Successfully joined the simple token contract");

    // Mint to each account
    console.log("🔢 Minting simple token...");
    let i = 1;
    for (const account of targets) {
      console.log(`🧾 Mint tx [${i} of ${targets.length}] starting for ${account}`);
      const mintResult = await mint(simpleTokenContract, account, amount);
      console.log(
        `✅ Simple token minted [${i} of ${targets.length}] txId=${mintResult.txId} block=${mintResult.blockHeight} account=${account}`
      );
      i += 1;
    }
    console.log("🎉 Mint process completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ Error during join and mint process (0x1)", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    if (wallet) {
      try {
        await wallet.stop();
        console.log("🧹 Wallet closed successfully");
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
}

// Run the script if this file is executed directly
if (import.meta.main) {
  const address = "mn_shield-addr_undeployed1zl9wafu8ad4nfm7jmrh8gukfnu3l5smn4rhglxqh6ayvf4f4vzasxqzn5va92vps2xxpdgy856z6cpzrllj3n35k5r3trp0unzskh9lwsvdzgnft";
  joinAndMint(address, 250000000000n).catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}

export { joinAndMint };

// Note: shieldedToken() is referenced in some legacy callers — re-export to avoid breaking them.
export { shieldedToken };
