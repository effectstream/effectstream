import {
  SimpleToken,
  witnesses as unshielded_erc20Witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";

import { balanceOf as balanceOfQuery } from "./balanceOf.ts";

import { type ContractAddress } from "@midnight-ntwrk/compact-runtime";
import { CompiledContract } from "@midnight-ntwrk/compact-js";

import {
  Transaction,
  type TransactionId,
  type CoinPublicKey,
  type EncPublicKey,
  type ShieldedCoinInfo,
  type UnprovenTransaction,
  type FinalizedTransaction,
  Transaction as LedgerV8Transaction,
  SignatureEnabled,
  PreProof,
  PreBinding,
} from "@midnight-ntwrk/ledger-v8";
import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
import { Buffer } from "buffer";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

import {
  Contract,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnboundTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { type Resource, WalletBuilder } from "@midnight-ntwrk/wallet";
import type { Wallet } from "@midnight-ntwrk/wallet-api";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "node:path";

import { wrapPublicDataProvider } from "./midnight-utils.ts";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { NetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  concatMap,
  filter,
  firstValueFrom,
  interval,
  map,
  of,
  take,
  tap,
  throwError,
  timeout,
  catchError,
} from "rxjs";
import { pipe as fnPipe } from "fp-ts/function";
import semver from "semver";

const BASE_URL_MIDNIGHT_NODE_A =
  import.meta.env.VITE_MIDNIGHT_NODE_HTTP || "http://127.0.0.1:9944";
const getMidnightNodeUrl = async (): Promise<string> => {
  return BASE_URL_MIDNIGHT_NODE_A;
};

const BASE_URL_MIDNIGHT_INDEXER =
  import.meta.env.VITE_MIDNIGHT_INDEXER_HTTP || "http://127.0.0.1:8088";
const BASE_WS_MIDNIGHT_INDEXER =
  import.meta.env.VITE_MIDNIGHT_INDEXER_WS || "ws://127.0.0.1:8088";
const BASE_URL_PROOF_SERVER =
  import.meta.env.VITE_MIDNIGHT_PROOF_SERVER_URL || "http://127.0.0.1:6300";
const BASE_URL_MIDNIGHT_INDEXER_API = `${BASE_URL_MIDNIGHT_INDEXER}/api/v3/graphql`;
const BASE_URL_MIDNIGHT_INDEXER_WS = `${BASE_WS_MIDNIGHT_INDEXER}/api/v3/graphql/ws`;

export class DelegatedBalancingSentError extends Error {
  constructor() {
    super("Delegated balancing flow handed off to batcher");
  }
}

let lastCapturedTx: string | null = null;
export const getLastCapturedTx = () => lastCapturedTx;

const toHex = (data: Uint8Array): string =>
  Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (hex: string): Uint8Array => {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const match = cleanHex.match(/.{1,2}/g);
  return new Uint8Array(match ? match.map((byte) => parseInt(byte, 16)) : []);
};

const MIDNIGHT_NETWORK_ID: NetworkId =
  (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as NetworkId) || "undeployed";

type ShieldedAddresses = Awaited<
  ReturnType<ConnectedAPI["getShieldedAddresses"]>
>;

type SimpleTokenPrivateStateId = "simpleTokenPrivateState";

type PrivateState = {};

export type MultiChainContract = Contract<
  PrivateState,
  typeof unshielded_erc20Witnesses
>;

// Inlined common types for standalone script
type SimpleTokenCircuits = ImpureCircuitId<SimpleToken.Contract>;

export type SimpleTokenProviders = MidnightProviders<
  SimpleTokenCircuits,
  typeof SimpleTokenPrivateStateId,
  {}
>;

type SimpleTokenContract = SimpleToken.Contract;

type DeployedSimpleTokenContract =
  | DeployedContract<SimpleTokenContract>
  | FoundContract<SimpleTokenContract>;

const simpleTokenContractInstance = new SimpleToken.Contract(
  unshielded_erc20Witnesses,
);

const getSimpleTokenLedgerState = async (
  providers: SimpleTokenProviders,
  contractAddress: ContractAddress,
): Promise<any | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state =
      contractState != null ? SimpleToken.ledger(contractState.data) : null;
    console.log(`📊 Ledger state:`, state);
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
  // The new midnight-js-contracts API requires `compiledContract` instead of
  // a raw `contract` instance.
  const compiledContract = CompiledContract.make(
    "unshielded-erc20",
    SimpleToken.Contract,
  ).pipe(
    CompiledContract.withWitnesses(unshielded_erc20Witnesses as never),
    CompiledContract.withCompiledFileAssets("./"),
  );

  const simpleTokenContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: "simpleTokenPrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${(simpleTokenContract as any).deployTxData.public.contractAddress}`,
  );
  return simpleTokenContract;
};

const wrapAddress = (address: string) => {
  return {
    is_left: true,
    left: { bytes: new Uint8Array(Buffer.from(address, "hex")) },
    right: { bytes: new Uint8Array(32) },
  };
};

const mint = async (
  simpleTokenContract: DeployedSimpleTokenContract,
  account: string,
  value: bigint,
): Promise<any> => {
  console.log("Minting...");
  console.log("account", account);
  const finalizedTxData = await (simpleTokenContract.callTx as any).mint(
    wrapAddress(account),
    value,
  );
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log(`Minted ${value} tokens to ${account}`);
  return finalizedTxData.public;
};

const transferFrom = async (
  simpleTokenContract: DeployedSimpleTokenContract,
  fromAccount: string,
  toAccount: string,
  amount: bigint,
): Promise<any> => {
  console.log("[TRANSFER FROM]", {
    fromAccount,
    toAccount,
    amount,
  });
  const finalizedTxData = await (simpleTokenContract.callTx as any).transfer(
    wrapAddress(toAccount),
    amount,
  );
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log(finalizedTxData);
  console.log(
    `Transferred ${amount} tokens from ${fromAccount} to ${toAccount}`,
  );
  return finalizedTxData.public;
};

const balanceOf = async (account: string): Promise<bigint> => {
  return await balanceOfQuery(account);
};

const displaySimpleTokenValue = async (
  providers: SimpleTokenProviders,
  simpleTokenContract: DeployedSimpleTokenContract,
): Promise<{ state: any | null; contractAddress: string }> => {
  const contractAddress = (simpleTokenContract as any).deployTxData.public
    .contractAddress;
  const state = await getSimpleTokenLedgerState(providers, contractAddress);
  return { contractAddress, state };
};

const connectToWallet = async (networkId: string): Promise<ConnectedAPI> => {
  const COMPATIBLE_CONNECTOR_API_VERSION = ">=1.0.0";
  const midnight = (window as any).midnight;

  if (!midnight) {
    throw new Error("Midnight Lace wallet not found. Extension installed?");
  }

  const wallets = Object.entries(midnight).filter(([_, api]: [string, any]) =>
    api.apiVersion && semver.satisfies(api.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  ) as [string, any][];

  if (wallets.length === 0) {
    throw new Error("No compatible Midnight wallet found.");
  }

  const [name, api] = wallets[0];
  console.log(`Connecting to wallet: ${name} (version ${api.apiVersion})`);

  const passwordProvider = async () => "EffectstreamStorage1!";

  const apiWithPassword: any = { ...api };
  if (typeof apiWithPassword.connect !== "function") {
    apiWithPassword.connect = api.connect;
  }
  apiWithPassword.privateStoragePasswordProvider = passwordProvider;

  return await apiWithPassword.connect(networkId);
};

const createWalletAndMidnightProvider = (
  connectedAPI: ConnectedAPI,
  coinPublicKey: CoinPublicKey,
  encryptionPublicKey: EncPublicKey,
): WalletProvider & MidnightProvider => {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return encryptionPublicKey;
    },
    async balanceTx(
      tx: UnboundTransaction,
      _ttl?: Date,
    ): Promise<FinalizedTransaction> {
      console.log(" erc20.ts: balanceTx called (delegated)", { tx, _ttl });

      const hexTx = toHex((tx as unknown as UnprovenTransaction).serialize());
      console.log(" erc20.ts: Capturing UNPROVEN transaction for delegation", {
        hexTxLength: hexTx.length,
      });
      lastCapturedTx = hexTx;

      throw new DelegatedBalancingSentError();
    },
    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      console.log(" erc20.ts: submitTx called (delegated)", { tx });
      throw new DelegatedBalancingSentError();
    },
  };
};

const initializeProviders = async (
  connectedAPI: ConnectedAPI,
  shieldedAddresses: ShieldedAddresses,
): Promise<SimpleTokenProviders> => {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = shieldedAddresses;

  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    connectedAPI,
    shieldedCoinPublicKey as any,
    shieldedEncryptionPublicKey as any,
  );

  const zkConfigPath = window.location.origin;

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
      accountId: shieldedCoinPublicKey || "default-account",
    } as any),
    zkConfigProvider: new FetchZkConfigProvider(zkConfigPath, fetch.bind(window)),
    proofProvider: httpClientProofProvider(BASE_URL_PROOF_SERVER),
    publicDataProvider: wrapPublicDataProvider(
      indexerPublicDataProvider(
        BASE_URL_MIDNIGHT_INDEXER_API,
        BASE_URL_MIDNIGHT_INDEXER_WS,
      ),
      BASE_URL_MIDNIGHT_INDEXER_API,
      "erc20.ts",
    ),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

const configureProviders = async (
  connectedAPI: ConnectedAPI,
  injectedWallet: Wallet & Resource,
) => {
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const providers = await initializeProviders(connectedAPI, shieldedAddresses);
  return {
    ...providers,
    injectedWalletProvider: injectedWallet,
  };
};

/**
 * Get contract address from the static contract_address/ folder copied by
 * vite-plugin-static-copy at build time.
 */
const getContractAddress = async (): Promise<string> => {
  const r = await fetch(
    `contract_address/unshielded-erc20.${MIDNIGHT_NETWORK_ID}.json`,
  );
  const json = await r.json();
  console.log("🔍 Contract address:", json.contractAddress);
  return json.contractAddress;
};

const connectMidnightWallet = async (
  connectedAPI: ConnectedAPI,
): Promise<{
  providers: SimpleTokenProviders;
  addresses: ShieldedAddresses;
}> => {
  console.log("🔗 Building Midnight wallet with v4 connector...");

  const addresses = await connectedAPI.getShieldedAddresses();
  const providers = await initializeProviders(connectedAPI, addresses);
  console.log("✅ Providers configured successfully");

  return { providers, addresses };
};

const connectToContract = async (
  providers: SimpleTokenProviders,
  contractAddress?: string,
): Promise<{
  contract: DeployedSimpleTokenContract;
  state: any | null;
  contractAddress: string;
}> => {
  const address = contractAddress || (await getContractAddress());
  console.log(
    `🔗 Joining multi chain multi token contract at address: ${address}`,
  );

  const contract = await joinContract(providers, address);
  console.log("✅ Successfully joined the multi chain multi token contract");

  // Get initial state
  const currentState = await displaySimpleTokenValue(providers, contract);
  console.log(`📊 Current state value:`, currentState);

  return {
    contract,
    state: currentState.state,
    contractAddress: currentState.contractAddress,
  };
};

export {
  mint,
  balanceOf,
  transferFrom,
  connectMidnightWallet,
  connectToContract,
};
