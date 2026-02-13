import {
  type ContractAddress,
  NetworkId,
} from "@midnight-ntwrk/compact-runtime";
import {
  MultiChainMultiToken,
  witnesses,
} from "./contract-eip-1155/src/index.original.ts";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/ledger";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
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
import { type Wallet } from "@midnight-ntwrk/wallet-api";
import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
import * as Rx from "rxjs";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "node:path";
import { access, readFile } from "node:fs/promises";

const exists = async (path: string): Promise<boolean> => {
  try { await access(path); return true; } catch { return false; }
};

/**
 * This script transfers 10.0 dust from the default midnight wallet to a given address.
 * This works only on the local undeployed network.
 *
 * This is useful to pass dust to Lace wallets in the browser for testing purposes.
 *
 * Usage:
 * MIDNIGHT_ADDRESS=mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx bun run faucet.ts
 *
 */

globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type MultiChainMultiTokenCircuits = ImpureCircuitId<MultiChainMultiToken.Contract>;

const MultiChainMultiTokenPrivateStateId = "multiChainMultiTokenPrivateState";

type MultiChainMultiTokenProviders = MidnightProviders<
  MultiChainMultiTokenCircuits,
  typeof MultiChainMultiTokenPrivateStateId,
  {}
>;

type MultiChainMultiTokenContract = MultiChainMultiToken.Contract;

type DeployedMultiChainMultiTokenContract =
  | DeployedContract<MultiChainMultiTokenContract>
  | FoundContract<MultiChainMultiTokenContract>;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId("Undeployed" as unknown as NetworkId);
  }
}

const config = new StandaloneConfig();

const currentDir = resolve(dirname(new URL(import.meta.url).pathname));

const contractConfig = {
  privateStateStoreName: "multichain_multitoken-private-state",
  zkConfigPath: resolve(
    currentDir,
    "contract-eip-1155",
    "src",
    "managed",
    "multichain_multitoken"
  ),
};

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const multiChainMultiTokenContractInstance: MultiChainMultiTokenContract =
  new MultiChainMultiToken.Contract(witnesses);

const getMultiChainMultiTokenLedgerState = async (
  providers: MultiChainMultiTokenProviders,
  contractAddress: ContractAddress
): Promise<bigint | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress
    );
    console.log("contractState", contractState);
    console.log(
      Object.entries(contractState).map(
        ([key, value]) => `${key}: ${value} (${typeof value})`
      )
    );
    const state =
      contractState != null ? MultiChainMultiToken.ledger(contractState.data) : null;
    console.log(
      `📊 Ledger state: ${
        state &&
        JSON.stringify(
          state,
          (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          2
        )
      }`
    );
    return state;
  } catch (error) {
    console.error("❌ Error getting multi chain multi token ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: MultiChainMultiTokenProviders,
  contractAddress: string
): Promise<DeployedMultiChainMultiTokenContract> => {
  console.log("Joining contract...🍋🍋🍋");
  const multiChainMultiTokenContract = await findDeployedContract(providers, {
    contractAddress,
    contract: multiChainMultiTokenContractInstance,
    privateStateId: "multiChainMultiTokenPrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${multiChainMultiTokenContract.deployTxData.public.contractAddress}`
  );
  return multiChainMultiTokenContract;
};

const balanceOf = async (
  multiChainMultiTokenContract: DeployedMultiChainMultiTokenContract,
  account: string
): Promise<bigint> => {
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(account)
  );
  const either = {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
  const accountBalance = await multiChainMultiTokenContract.callTx.balanceOf(either);
  return accountBalance.private.result as bigint;
};

const mint = async (
  multiChainMultiTokenContract: DeployedMultiChainMultiTokenContract,
  account: string,
  value: bigint
): Promise<FinalizedTxData> => {
  console.log("Minting...");
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(account)
  );
  console.log("shieldedAddress", shieldedAddress.coinPublicKeyString());
  const either = {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
  const finalizedTxData = await multiChainMultiTokenContract.callTx.mint(either, value);
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`
  );
  console.log(`Minted ${value} tokens to ${account}`);
  return finalizedTxData.public;
};

const createWalletAndMidnightProvider = async (
  wallet: Wallet
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    balanceTx(
      tx: UnbalancedTransaction,
      newCoins: CoinInfo[]
    ): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(
          ZswapTransaction.deserialize(
            tx.serialize(getLedgerNetworkId()),
            getZswapNetworkId()
          ),
          newCoins
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) =>
          Transaction.deserialize(
            zswapTx.serialize(getZswapNetworkId()),
            getLedgerNetworkId()
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
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`
        );
      }),
      Rx.filter((state: any) => {
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s: any) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance: bigint) => balance > 0n)
    )
  );

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
  filename: string
): Promise<Wallet & Resource> => {
  const directoryPath = process.env.SYNC_CACHE;
  let wallet: Wallet & Resource;
  if (directoryPath !== undefined) {
    const fullPath = `${directoryPath}/${filename}`;
    if (await exists(fullPath)) {
      console.log(`Attempting to restore state from ${fullPath}`);
      try {
        const serialized = await readFile(fullPath);
        wallet = await WalletBuilder.restore(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          serialized.toString()
        );
        wallet.start();
      } catch (error: unknown) {
        console.log(
          "Wallet was not able to restore using the stored state, building wallet from scratch"
        );
        wallet = await WalletBuilder.buildFromSeed(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          getZswapNetworkId(),
          "info"
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
        "info"
      );
      wallet.start();
    }
  } else {
    console.log(
      "📁 File path for save file not found, building wallet from scratch"
    );

    try {
      wallet = await WalletBuilder.build(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        NetworkId.Undeployed
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


const faucet = async (receiverAddress: string): Promise<void> => {

  // Initialize configuration
  const config = new StandaloneConfig();

  let wallet = null;

  try {
    console.log("🔗 Building wallet with genesis seed for standalone mode...");

    // Build wallet using genesis seed (which has initial funds in standalone mode)
    wallet = await buildWalletAndWaitForFunds(
      config,
      GENESIS_MINT_WALLET_SEED,
      "contract.json"
    );

    console.log("✅ Wallet built successfully");

    /* Transfer dust to lace wallet */
    const transferRecipe = await wallet.transferTransaction([
      {
        amount: 10000000n, // 10 Dust
        type: nativeToken(), // "tDUST",
        receiverAddress,
      },
    ]);
    console.log({ transferRecipe });

    const provenTransaction = await wallet.proveTransaction(transferRecipe);
    console.log({ provenTransaction });

    const submittedTransaction = await wallet.submitTransaction(
      provenTransaction
    );
    console.log({ submittedTransaction });

    console.log("✅ Successfully transferred dust to receiver address ");


  } catch (error) {
    console.error("❌ Error during join and mint process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    // Clean up wallet
    if (wallet) {
      try {
        console.log("🧹 Wallet closed successfully");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
};

// Run the script if this file is executed directly
if (import.meta.main) {
  const midnightAddress = process.env.MIDNIGHT_ADDRESS;
  if (!midnightAddress) {
    console.error("❌ MIDNIGHT_ADDRESS environment variable is not set");
    console.error("Example: MIDNIGHT_ADDRESS=mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx bun run faucet.ts");
    process.exit(1);
  }
  try {
    await faucet(midnightAddress);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during faucet process:", error);
    process.exit(1);
  }
}
