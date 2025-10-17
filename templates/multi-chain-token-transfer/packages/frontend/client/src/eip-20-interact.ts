import {
  type ContractAddress,
  NetworkId,
} from "@midnight-ntwrk/compact-runtime";
import {
  SimpleToken,
  // type CounterPrivateState,
  witnesses,
} from "@multi-chain-transfer/my-midnight-contract";
import {
  type CoinInfo,
  nativeToken,
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
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";

const BASE_URL_MIDNIGHT_NODE_A = `http://127.0.0.1:9944`;
const getMidnightNodeUrl = async (): Promise<string> => {
  return BASE_URL_MIDNIGHT_NODE_A;
};

const BASE_URL_MIDNIGHT_INDEXER = `http://127.0.0.1:8088`;
const BASE_WS_MIDNIGHT_INDEXER = `ws://127.0.0.1:8088`;
const BASE_URL_PROOF_SERVER = `http://127.0.0.1:6300`;
const BASE_URL_MIDNIGHT_INDEXER_API = `${BASE_URL_MIDNIGHT_INDEXER}/api/v1/graphql`;
const BASE_URL_MIDNIGHT_INDEXER_WS = `${BASE_WS_MIDNIGHT_INDEXER}/api/v1/graphql/ws`;


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


// Inlined config for standalone script
const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

const contractConfig = {
  privateStateStoreName: "simpletoken-private-state",
  zkConfigPath: resolve(
    currentDir,
    "contract-eip-20",
    "src",
    "managed",
    "simpletoken",
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
  node: string;
  proofServer = BASE_URL_PROOF_SERVER;
  constructor(nodeUrl: string) {
    this.node = nodeUrl;
    setNetworkId("Undeployed" as any);
  }
}

/**
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const simpleTokenContractInstance: SimpleTokenContract = new SimpleToken
  .Contract(
  witnesses,
);

const getCounterLedgerState = async (
  providers: SimpleTokenProviders,
  contractAddress: ContractAddress,
): Promise<any | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state = contractState != null
      ? SimpleToken.ledger(contractState.data)
      : null;
    console.log(`📊 Ledger state: ${state}`);
    return state;
  } catch (error) {
    console.error("❌ Error getting counter ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: SimpleTokenProviders,
  contractAddress: string,
): Promise<DeployedSimpleTokenContract> => {
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
  console.log("shieldedAddress", shieldedAddress.coinPublicKeyString());
  const either = {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
  const finalizedTxData = await (simpleTokenContract.callTx as any).mint(either, value);
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log(`Minted ${value} tokens to ${account}`);
  return finalizedTxData.public;
};

const balanceOf = async (
  simpleTokenContract: any, // DeployedSimpleTokenContract,
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
  const balance = await (simpleTokenContract.callTx as any).balanceOf(either);
  console.log('balanceOf', balance);
  return balance.private.result as bigint;
};

const transferToEvm = async (
  simpleTokenContract: any, // DeployedSimpleTokenContract,
  account: string,
  targetAddress: string,
  amount: bigint,
  txHash: string,
): Promise<FinalizedTxData> => {
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(account),
  );
  const either = {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
  const finalizedTxData = await (simpleTokenContract.callTx as any).transferToEvm(targetAddress, amount, txHash);
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log(`Transferred ${amount} tokens to ${targetAddress}`);
  return finalizedTxData.public;
};

// const increment = async (
//   counterContract: DeployedCounterContract,
//   contractAddress: string,
//   tokenId: string,
//   propertyName: string,
//   propertyValue: string,
// ): Promise<FinalizedTxData> => {
//   console.log("Incrementing...");

//   console.log(`📝 Using parameters:`);
//   console.log(`   Contract Address: ${contractAddress}`);
//   console.log(`   Token ID: ${tokenId}`);
//   console.log(`   Property Name: ${propertyName}`);
//   console.log(`   Property Value: ${propertyValue}`);

//   const toEncodedString = (str: string, length = 32) =>
//     Uint8Array.from(
//       str.padEnd(length, " ").split("").map((c) => c.charCodeAt(0)),
//     );
//   const finalizedTxData = await counterContract.callTx.increment(
//     toEncodedString(contractAddress, 64),
//     toEncodedString(tokenId, 64),
//     toEncodedString(propertyName, 32),
//     toEncodedString(propertyValue, 32),
//   );
//   console.log(
//     `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
//   );
//   return finalizedTxData.public;
// };

const displayCounterValue = async (
  providers: SimpleTokenProviders,
  simpleTokenContract: DeployedSimpleTokenContract,
): Promise<{ state: any | null; contractAddress: string }> => {
  const contractAddress = simpleTokenContract.deployTxData.public.contractAddress;
  const state = await getCounterLedgerState(providers, contractAddress);
  return { contractAddress, state };
};

const createWalletAndMidnightProvider = async (
  wallet: Wallet,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await wallet.state();
  console.log({state});

  const object =  {
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
  console.log({object});
  return object;
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

const oldCreateWalletAndMidnightProvider = async (
  wallet: Wallet,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  console.log({ oldState: state });
  const balance = await waitForFunds(wallet);
  console.log({ balance });
  console.log({ oldState: state });

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
  internalWallet: Wallet & Resource,
  injectedWallet: Wallet & Resource,
  config: Config,
) => {

  const internalWalletAndMidnightProvider = await oldCreateWalletAndMidnightProvider(
    internalWallet,
  );

  const injectedWalletAndMidnightProvider = await createWalletAndMidnightProvider(
    injectedWallet,
  );

  console.log({ internalWalletAndMidnightProvider, injectedWalletAndMidnightProvider });

  const privateStateProvider = levelPrivateStateProvider<
    typeof SimpleTokenPrivateStateId
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

  const providers: SimpleTokenProviders = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider: internalWalletAndMidnightProvider,
    midnightProvider: internalWalletAndMidnightProvider,
    injectedWalletProvider: injectedWalletAndMidnightProvider,
    injectedMidnightProvider: injectedWalletAndMidnightProvider,
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

const connectMidnightWallet = async (injectedWallet: any): Promise<{
  injectedWallet: Wallet & Resource;
  internalWallet: Wallet & Resource;
  providers: SimpleTokenProviders;
}> => {
  console.log("🔗 Building Midnight wallet with genesis seed...");

  const midnightNodeUrl = await getMidnightNodeUrl();
  const config = new StandaloneConfig(midnightNodeUrl);
  const internalWallet = await buildWalletAndWaitForFunds(
    config,
    GENESIS_MINT_WALLET_SEED,
    "contract.json",
  );

  // console.log("✅ Midnight wallet built successfully");

  const providers = await configureProviders(internalWallet, injectedWallet, config);
  console.log("✅ Providers configured successfully");

  return { internalWallet, injectedWallet, providers };
};

const connectToContract = async (
  providers: SimpleTokenProviders,
  contractAddress?: string,
): Promise<{
  contract: DeployedSimpleTokenContract;
  state: any | null;
  contractAddress: string;
}> => {
  const address = contractAddress || await getContractAddress();
  console.log(`🔗 Joining simple token contract at address: ${address}`);

  const contract = await joinContract(providers, address);
  console.log("✅ Successfully joined the simple token contract");

  // Get initial state
  const currentState = await displayCounterValue(providers, contract);
  console.log(`📊 Current state value: ${currentState}`);
  

  return { contract, state: currentState.state, contractAddress: currentState.contractAddress };
};

const fetchCurrentCounterState = async (
  providers: SimpleTokenProviders,
  simpleTokenContract?: DeployedSimpleTokenContract,
): Promise<{ state: any | null; contractAddress: string }> => {
  const actualProviders = providers;
  const actualContract = simpleTokenContract;

  if (!actualProviders || !actualContract) {
    throw new Error("Providers and contract must be initialized first");
  }

  return await displayCounterValue(actualProviders, actualContract);
};

// const incrementCounterValue = async (
//   contractAddress: string,
//   tokenId: string,
//   propertyName: string,
//   propertyValue: string,
//   contract: DeployedSimpleTokenContract,
// ): Promise<FinalizedTxData> => {

//   if (!contract) {
//     throw new Error("Contract must be joined first");
//   }

//   console.log("🔢 Incrementing counter...");
//   const result = await increment(
//     contract,
//     contractAddress,
//     tokenId,
//     propertyName || "",
//     propertyValue || "",
//   );
//   console.log(
//     `✅ Counter incremented successfully! Transaction ID: ${result.txId}`,
//   );

//   return result;
// };

export {
  mint,
  balanceOf,
  connectMidnightWallet,
  connectToContract,
  fetchCurrentCounterState,
  // incrementCounterValue,
  transferToEvm,
};
