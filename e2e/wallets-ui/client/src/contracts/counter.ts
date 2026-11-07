import {
  Counter,
  witnesses as counterWitnesses,
} from "../../../../shared/contracts/midnight/contract-counter/src/index.ts";

import type { ContractAddress } from "@midnight-ntwrk/compact-runtime";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { ContractState, Transaction } from "@midnightntwrk/ledger-v9";

import { Contract } from '@midnight-ntwrk/compact-js';
import {
  createMidnightProviderFromHandlers,
  createWalletProviderFromHandlers,
  type Ledger9FinalizedTxData,
  type MidnightProvider,
  type MidnightProviders,
  type NetworkId,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { CompiledContract } from '@midnight-ntwrk/compact-js';
const BASE_URL_MIDNIGHT_INDEXER = `http://127.0.0.1:8088`;
const BASE_WS_MIDNIGHT_INDEXER = `ws://127.0.0.1:8088`;
const BASE_URL_PROOF_SERVER = `http://127.0.0.1:6300`;
const BASE_URL_MIDNIGHT_INDEXER_API = `${BASE_URL_MIDNIGHT_INDEXER}/api/v4/graphql`;
const BASE_URL_MIDNIGHT_INDEXER_WS = `${BASE_WS_MIDNIGHT_INDEXER}/api/v4/graphql/ws`;

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

type CounterCircuits = Contract.ProvableCircuitId<CounterContract>;

export type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof counterPrivateStateId,
  {}
>;

type DeployedCounterContract =
  | DeployedContract<CounterContract>
  | FoundContract<CounterContract>;

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
    if (contractState == null) {
      console.log("📊 Ledger state: null");
      return null;
    }

    // Parse state directly from raw data
    try {
      // Extract raw data from the state
      const rawData = contractState.contractState
        .deserialize({ v9: ContractState })
        .data.state;
      console.log("Raw state data:", rawData);
      console.log("Raw state as string:", rawData.toString());

      // Try to parse the array structure
      if (rawData.asArray && typeof rawData.asArray === 'function') {
        const array = rawData.asArray();
        console.log("State array:", array);

        if (array && array.length > 0) {
          const firstElement = array[0];
          console.log("First element:", firstElement);

          // Try to extract the cell value
          if (firstElement.asCell && typeof firstElement.asCell === 'function') {
            const cell = firstElement.asCell();
            console.log("Cell:", cell);

            if (cell.value && Array.isArray(cell.value) && cell.value.length > 0) {
              const rawBytes = cell.value[0];
              console.log("Raw bytes:", rawBytes);

              // If we have a Uint8Array, convert it to a number
              if (rawBytes instanceof Uint8Array)  {
                if (rawBytes.length === 0) {
                  console.log(`✅ Parsed counter value: 0`);
                  return { round: BigInt(0) };
                }
                if (rawBytes.length > 0) {
                  const value = rawBytes[0];
                  console.log(`✅ Parsed counter value: ${value}`);
                  // Return a structure matching the expected format
                  return { round: BigInt(value) };
                }
              }
            }
          }
        }
      }

      console.warn("⚠️ Could not parse state, returning raw data");
      return { raw: rawData.toString() };
    } catch (error) {
      console.error("❌ Error parsing counter ledger state:", error);
      throw error;
    }
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
): Promise<Ledger9FinalizedTxData> => {
  console.log("Incrementing counter...");
  lastCapturedTx = null;
  let finalizedTxData;
  try {
    finalizedTxData = await counterContract.callTx.increment();
  } catch (error) {
    // midnight-js wraps a provider's failure in ProviderFailedError, so the
    // delegated hand-off is recognised by the captured transaction rather
    // than by the class of the error the provider threw.
    if (useDelegatedBalancing && lastCapturedTx !== null) {
      throw new DelegatedBalancingSentError();
    }
    throw error;
  }
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
    shieldedAddress: shieldedAddresses.shieldedAddress,
    shieldedCoinPublicKey: shieldedAddresses.shieldedCoinPublicKey,
    shieldedEncryptionPublicKey: shieldedAddresses.shieldedEncryptionPublicKey,
    unshieldedAddress: { unshieldedAddress: unshieldedAddress.unshieldedAddress },
    dustAddress: { dustAddress: dustAddress.dustAddress },
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
    contract: FoundContract<CounterContract>;
    state: any | null;
    contractAddress: string;
  }> => {
  const address = contractAddress || (await getContractAddress());
  console.log(
    `🔗 Joining Counter contract at address: ${address}`
  );

  // First, create the compiled contract
  const MyCompiledContract = CompiledContract.make('contract-counter', Counter.Contract).pipe(
    CompiledContract.withWitnesses(counterWitnesses as never),
    CompiledContract.withCompiledFileAssets('./')
  );

  const counterContract: FoundContract<CounterContract> = await findDeployedContract(providers, {
    contractAddress: address,
    compiledContract: MyCompiledContract,
    privateStateId: "counterPrivateState",
    initialPrivateState: {},
  });
  console.log("✅ Successfully joined the Counter contract");

  const currentState = await displayCounterValue(providers, counterContract);
  console.log(`📊 Current state value:`, currentState.state);

  return {
    contract: counterContract,
    state: currentState.state,
    contractAddress: currentState.contractAddress,
  };
};

/**
 * Wallet and midnight providers backed by the DApp Connector (ledger-v9 only),
 * following midnight-js 5's `dappConnectorWalletProviders`. In delegated mode
 * the unbound transaction is captured for the batcher instead of balanced.
 */
const createWalletAndMidnightProviders = (
  connectedAPI: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string
): { walletProvider: WalletProvider; midnightProvider: MidnightProvider } => {
  const walletProvider = createWalletProviderFromHandlers({
    v8: undefined,
    v9: async (tx) => {
      console.log(" counter.ts: balanceTx called", { useDelegatedBalancing });
      const serializedTx = toHex(tx.serialize());

      if (useDelegatedBalancing) {
        console.log(" counter.ts: Capturing UNBOUND transaction for delegation", { hexTxLength: serializedTx.length });
        lastCapturedTx = serializedTx;
        throw new DelegatedBalancingSentError();
      }

      // Direct mode: the wallet balances, proves and binds the transaction.
      console.log(" counter.ts: Balancing transaction via the wallet...");
      const balanced = await connectedAPI.balanceUnsealedTransaction(serializedTx);
      return fromHex(balanced.tx);
    },
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
  });

  const midnightProvider = createMidnightProviderFromHandlers({
    v8: undefined,
    v9: async (tx) => {
      console.log(" counter.ts: submitTx called", { useDelegatedBalancing });
      if (useDelegatedBalancing) {
        throw new DelegatedBalancingSentError();
      }
      // The connector's submit returns nothing, so the transaction id the
      // framework watches for is read off the transaction itself.
      const [txId] = tx.deserialize({ v9: Transaction }).identifiers();
      if (txId === undefined) {
        throw new Error("Refusing to submit a transaction without an identifier");
      }
      console.log(" counter.ts: Submitting balanced transaction via the wallet...");
      await connectedAPI.submitTransaction(toHex(tx.serialize()));
      return txId;
    },
  });

  return { walletProvider, midnightProvider };
};

const initializeProviders = async (
  connectedAPI: ConnectedAPI,
  addresses: WalletAddresses
): Promise<CounterProviders> => {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = addresses;

  const { walletProvider, midnightProvider } = createWalletAndMidnightProviders(
    connectedAPI,
    shieldedCoinPublicKey,
    shieldedEncryptionPublicKey
  );
  
  const zkConfigPath = window.location.origin;
  const zkConfigProvider = new FetchZkConfigProvider<"increment">(
    zkConfigPath,
    fetch.bind(window)
  );
  return {
    privateStateProvider: levelPrivateStateProvider({
      // `accountId` scopes the level-db storage per-wallet so two wallets on
      // the same browser don't trample each other's private state. The
      // unshielded address is a stable per-wallet identifier (the shielded
      // address falls back if no unshielded one was returned).
      accountId:
        addresses.unshieldedAddress.unshieldedAddress ||
        addresses.shieldedAddress ||
        "default-account",
      // Must hit 3-of-4 character classes (upper, lower, digit, special).
      privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
    } as any),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(BASE_URL_PROOF_SERVER, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(
        BASE_URL_MIDNIGHT_INDEXER_API,
        BASE_URL_MIDNIGHT_INDEXER_WS,
    ),
    walletProvider,
    midnightProvider,
    config: {
      networkId: MIDNIGHT_NETWORK_ID,
      ttlSeconds: 60 * 60,
    },
  };
};
