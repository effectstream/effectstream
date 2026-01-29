import {
  Counter,
  witnesses as counterWitnesses,
} from "../../../../shared/contracts/midnight/contract-counter/src/index.ts";

import {
  type ContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import type { TransactionId } from "@midnight-ntwrk/ledger";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import {
  CoinPublicKey,
  EncPublicKey,
  FinalizedTransaction,
  ShieldedCoinInfo,
  UnprovenTransaction,
  Transaction as LedgerV6Transaction,
} from "@midnight-ntwrk/ledger-v6";
import {
  type BalancedProvingRecipe,
  Contract,
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type WalletProvider,
  TRANSACTION_TO_PROVE,
  NOTHING_TO_PROVE,
} from "@midnight-ntwrk/midnight-js-types";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import { NetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

const BASE_URL_MIDNIGHT_INDEXER = `http://127.0.0.1:8088`;
const BASE_WS_MIDNIGHT_INDEXER = `ws://127.0.0.1:8088`;
const BASE_URL_PROOF_SERVER = `http://127.0.0.1:6300`;
const BASE_URL_MIDNIGHT_INDEXER_API = `${BASE_URL_MIDNIGHT_INDEXER}/api/v3/graphql`;
const BASE_URL_MIDNIGHT_INDEXER_WS = `${BASE_WS_MIDNIGHT_INDEXER}/api/v3/graphql/ws`;

export class DelegatedBalancingSentError extends Error {
  constructor() {
    super("Delegated balancing flow handed off to batcher");
  }
}

let lastCapturedTx: string | null = null;
export const getLastCapturedTx = () => lastCapturedTx;

let useDelegatedBalancing = false;
export const setUseDelegatedBalancing = (value: boolean) => {
  console.log(`Setting delegation mode to: ${value}`);
  useDelegatedBalancing = value;
};

const toHex = (data: Uint8Array): string =>
  Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (hex: string): Uint8Array => {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const match = cleanHex.match(/.{1,2}/g);
  return new Uint8Array(match ? match.map((byte) => parseInt(byte, 16)) : []);
};

const MIDNIGHT_NETWORK_ID: NetworkId = "undeployed";

type ShieldedAddresses = Awaited<
  ReturnType<ConnectedAPI["getShieldedAddresses"]>
>;

type WalletAddresses = ShieldedAddresses & {
  unshieldedAddress: Awaited<
    ReturnType<ConnectedAPI["getUnshieldedAddress"]>
  >;
  dustAddress: Awaited<ReturnType<ConnectedAPI["getDustAddress"]>>;
};

type PrivateState = {};

const counterPrivateStateId = "counterPrivateState";

export type CounterChainContract = Contract<
  PrivateState,
  typeof counterWitnesses
>;

type CounterContract = Counter.Contract;

type CounterCircuits = ImpureCircuitId<CounterContract>;

export type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof counterPrivateStateId,
  {}
>;

type DeployedCounterContract =
  | DeployedContract<CounterContract>
  | FoundContract<CounterContract>;

const counterContractInstance = new Counter.Contract(
  counterWitnesses,
);

export const getCounterLedgerState = async (
  providers: CounterProviders,
  contractAddress: ContractAddress,
): Promise<any | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state = contractState != null
      ? Counter.ledger(contractState.data)
      : null;
    console.log(`📊 Ledger state:`, state);
    return state;
  } catch (error) {
    console.error("❌ Error getting counter ledger state:", error);
    throw error;
  }
};

export const queryTransactionStatus = async (txId: string): Promise<boolean> => {
  // Normalize hash format
  let normalizedHash = txId.toLowerCase().replace(/^0x/, "");
  if (normalizedHash.length > 64) {
    normalizedHash = normalizedHash.slice(-64);
  } else if (normalizedHash.length < 64) {
    normalizedHash = normalizedHash.padStart(64, "0");
  }

  const query = `query ($hash: String!) {
    transactions(offset: { hash: $hash }) {
      hash
      block {
        height
      }
    }
  }`;

  try {
    const response = await fetch(BASE_URL_MIDNIGHT_INDEXER_API, {
      method: "POST",
      body: JSON.stringify({ query, variables: { hash: normalizedHash } }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();
    const confirmed = result?.data?.transactions?.[0]?.block?.height != null;
    return confirmed;
  } catch (e) {
    console.error("Failed to query tx status:", e);
    return false;
  }
};

export const increment = async (
  counterContract: DeployedCounterContract,
): Promise<FinalizedTxData> => {
  console.log("Incrementing counter...");
  const finalizedTxData = await (counterContract.callTx as any).increment();
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  return finalizedTxData.public;
};

const displayCounterValue = async (
  providers: CounterProviders,
  counterContract: DeployedCounterContract,
): Promise<{ state: any | null; contractAddress: string }> => {
  const contractAddress = counterContract.deployTxData.public.contractAddress;
  const state = await getCounterLedgerState(providers, contractAddress);
  return { contractAddress, state };
};

const getContractAddress = async (): Promise<string> => {
  console.log("🔍 Fetching contract address from /contract_address/counter.undeployed.json");
  let r = await fetch("/contract_address/counter.undeployed.json");
  if (!r.ok) {
    console.warn("⚠️ Absolute path fetch failed, trying relative path...");
    r = await fetch("contract_address/counter.undeployed.json");
  }
  if (!r.ok) {
    throw new Error(`Failed to fetch contract address: ${r.status} ${r.statusText}`);
  }
  const json = await r.json();
  console.log("✅ Contract address found:", json.contractAddress);
  return json.contractAddress;
};

const fetchWalletAddresses = async (
  connectedAPI: ConnectedAPI
): Promise<WalletAddresses> => {
  const [shieldedAddresses, unshieldedAddress, dustAddress] =
    await Promise.all([
      connectedAPI.getShieldedAddresses(),
      connectedAPI.getUnshieldedAddress(),
      connectedAPI.getDustAddress(),
    ]);

  return {
    ...shieldedAddresses,
    unshieldedAddress,
    dustAddress,
  };
};

export const connectMidnightWallet = async (
  connectedAPI: ConnectedAPI,
): Promise<{
  providers: CounterProviders;
  addresses: WalletAddresses;
}> => {
  console.log("🔗 Building Midnight wallet with connector...");

  const addresses = await fetchWalletAddresses(connectedAPI);
  const providers = await initializeProviders(connectedAPI, addresses);
  console.log("✅ Providers configured successfully");

  return { providers, addresses };
};

export const connectToContract = async (
  providers: CounterProviders,
  contractAddress?: string
): Promise<{
    contract: DeployedCounterContract;
    state: any | null;
    contractAddress: string;
  }> => {
  const address = contractAddress || (await getContractAddress());
  console.log(
    `🔗 Joining Counter contract at address: ${address}`
  );

  const counterContract = await findDeployedContract(providers, {
    contractAddress: address,
    contract: counterContractInstance,
    privateStateId: "counterPrivateState",
    initialPrivateState: {},
  });
  console.log("✅ Successfully joined the Counter contract");

  const currentState = await displayCounterValue(providers, counterContract);
  console.log(`📊 Current state value:`, currentState);

  return {
    contract: counterContract,
    state: currentState.state,
    contractAddress: currentState.contractAddress,
  };
};

const createWalletAndMidnightProvider = (
  connectedAPI: ConnectedAPI,
  coinPublicKey: CoinPublicKey,
  encryptionPublicKey: EncPublicKey
): WalletProvider & MidnightProvider => {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return encryptionPublicKey;
    },
    async balanceTx(
      tx: UnprovenTransaction,
      _newCoins?: ShieldedCoinInfo[],
      _ttl?: Date
    ): Promise<BalancedProvingRecipe> {
      console.log(" counter.ts: balanceTx called", { useDelegatedBalancing });
      
      if (useDelegatedBalancing) {
        try {
          const hexTx = toHex(tx.serialize());
          console.log(" counter.ts: Capturing UNPROVEN transaction for delegation", { hexTxLength: hexTx.length });
          lastCapturedTx = hexTx;
          
          return {
            type: TRANSACTION_TO_PROVE,
            transaction: tx,
          };
        } catch (error) {
          console.error(" counter.ts: balanceTx serialization failed", error);
          throw error;
        }
      }

      // Direct mode: use DApp Connector to balance and prove
      console.log(" counter.ts: Balancing transaction via Lace...");
      // For some reason the dapp-connector-api types might be slightly off or we need to pass hex
      const result = await (connectedAPI as any).balanceUnsealedTransaction(toHex(tx.serialize()));
      const balancedTx = LedgerV6Transaction.deserialize(
        'signature',
        'proof',
        'binding',
        fromHex(result.tx)
      );

      return {
        type: NOTHING_TO_PROVE,
        transaction: balancedTx as any,
      };
    },
    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      console.log(" counter.ts: submitTx called", { useDelegatedBalancing });
      if (useDelegatedBalancing) {
        throw new DelegatedBalancingSentError();
      }
      
      // Direct submission via Lace
      console.log(" counter.ts: Submitting balanced transaction via Lace...");
      const txId = await (connectedAPI as any).submitTransaction(toHex(tx.serialize()));
      return txId;
    },
  };
};

const initializeProviders = async (
  connectedAPI: ConnectedAPI,
  addresses: WalletAddresses
): Promise<CounterProviders> => {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = addresses;

  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    connectedAPI,
    shieldedCoinPublicKey as any,
    shieldedEncryptionPublicKey as any
  );
  
  const zkConfigPath = window.location.origin;
  
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStoragePasswordProvider: async () => "PAIMA_STORAGE_PASSWORD"
    } as any),
    zkConfigProvider: new FetchZkConfigProvider(
      zkConfigPath,
      fetch.bind(window)
    ) as any,
    proofProvider: httpClientProofProvider(BASE_URL_PROOF_SERVER),
    publicDataProvider: indexerPublicDataProvider(
        BASE_URL_MIDNIGHT_INDEXER_API,
        BASE_URL_MIDNIGHT_INDEXER_WS,
    ),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};
