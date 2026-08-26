// ── External SDK: ledger / runtime ────────────────────────────────────────
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { type ContractAddress } from "@midnight-ntwrk/compact-runtime";

// ── External SDK: Midnight JS ─────────────────────────────────────────────
import {
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { type NetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  type Contract,
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnboundTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";

// ── External SDK: wallet / address ────────────────────────────────────────
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type {
  CoinPublicKey,
  EncPublicKey,
  FinalizedTransaction,
  TransactionId,
  UnprovenTransaction,
} from "@midnightntwrk/ledger-v9";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";

// ── Workspace ─────────────────────────────────────────────────────────────
import {
  erc7683,
  witnesses as erc7683Witnesses,
} from "@night-bitcoin/midnight-contract-erc7683";

// ── Local ─────────────────────────────────────────────────────────────────
import { wrapPublicDataProvider } from "./midnight-utils.ts";

const BASE_URL_MIDNIGHT_INDEXER =
  import.meta.env.VITE_MIDNIGHT_INDEXER_HTTP || "http://127.0.0.1:8088";
const BASE_WS_MIDNIGHT_INDEXER =
  import.meta.env.VITE_MIDNIGHT_INDEXER_WS || "ws://127.0.0.1:8088";
const BASE_URL_PROOF_SERVER =
  import.meta.env.VITE_MIDNIGHT_PROOF_SERVER_URL || "http://127.0.0.1:6300";
const BASE_URL_MIDNIGHT_INDEXER_API = `${BASE_URL_MIDNIGHT_INDEXER}/api/v3/graphql`;
const BASE_URL_MIDNIGHT_INDEXER_WS = `${BASE_WS_MIDNIGHT_INDEXER}/api/v3/graphql/ws`;
const BATCHER_URL =
  import.meta.env.VITE_BATCHER_URL || "http://127.0.0.1:3334";

export class DelegatedBalancingSentError extends Error {
  constructor() {
    super("Delegated balancing flow handed off to batcher");
    // Set explicitly so `error.name === "DelegatedBalancingSentError"` is a
    // reliable fallback when `instanceof` fails — midnight-js's `scoped(...)`
    // wraps balanceTx throws as `Error: "Unexpected error submitting scoped
    // transaction..."` with the original at `.cause`, so the cause-chain
    // walker in interface.ts depends on this name being set.
    this.name = "DelegatedBalancingSentError";
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

type WalletAddresses = ShieldedAddresses & {
  unshieldedAddress: string;
  dustAddress: string;
};

type PrivateState = {};

const erc7683PrivateStateId = "erc7683PrivateState";

export type Erc7683ChainContract = Contract<
  PrivateState,
  typeof erc7683Witnesses
>;

type Erc7683Contract = erc7683.Contract;

type Erc7683Circuits = ImpureCircuitId<Erc7683Contract>;

export type Erc7683Providers = MidnightProviders<
  Erc7683Circuits,
  typeof erc7683PrivateStateId,
  {}
>;

type DeployedErc7683Contract =
  | DeployedContract<Erc7683Contract>
  | FoundContract<Erc7683Contract>;

const erc7683ContractInstance = new erc7683.Contract(erc7683Witnesses);

const getErc7683LedgerState = async (
  providers: Erc7683Providers,
  contractAddress: ContractAddress,
): Promise<any | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state =
      contractState != null ? erc7683.ledger(contractState.data) : null;
    console.log(`📊 Ledger state:`, state);
    return state;
  } catch (error) {
    console.error("❌ Error getting erc7683 ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: Erc7683Providers,
  contractAddress: string,
): Promise<DeployedErc7683Contract> => {
  // The new midnight-js-contracts API requires `compiledContract` instead of
  // a raw `contract` instance.
  const compiledContract = CompiledContract.make(
    "erc7683",
    erc7683.Contract,
  ).pipe(
    CompiledContract.withWitnesses(erc7683Witnesses as never),
    CompiledContract.withCompiledFileAssets("./"),
  );

  const erc7683Contract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: "erc7683PrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${erc7683Contract.deployTxData.public.contractAddress}`,
  );
  return erc7683Contract;
};

const createIntent = async (
  erc7683Contract: DeployedErc7683Contract,
  account: string,
  config: {
    user?: string;
    orderId?: string;
    originChainId?: bigint;
    openDeadline?: bigint;
    fillDeadline?: bigint;
    maxSpent_token?: string;
    maxSpent_amount?: bigint;
    maxSpent_recipient?: string;
    maxSpent_chainId?: bigint;
    minReceived_token?: string;
    minReceived_amount?: bigint;
    minReceived_recipient?: string;
    minReceived_chainId?: bigint;
    destinationChainId?: bigint;
    destinationSettler?: string;
    originData?: Object;
  } = {},
): Promise<FinalizedTxData & typeof config> => {
  console.log("Creating intent...");
  const shieldedAddress = ShieldedAddress.codec.decode(
    MIDNIGHT_NETWORK_ID as any,
    MidnightBech32m.parse(account),
  );
  console.log("shieldedAddress", shieldedAddress.coinPublicKeyString());

  const toEncodedString = (str: string, length: number): Uint8Array => {
    const buffer = new Uint8Array(length);
    const encoded = new TextEncoder().encode(str);
    buffer.set(encoded.slice(0, length));
    return buffer;
  };

  console.log("erc7683Contract.callTx.initialize", config);
  const finalizedTxData = await (erc7683Contract.callTx as any).initialize(
    toEncodedString(config.user || "", 256),
    toEncodedString(config.orderId || "", 32),
    config.originChainId || 0n,
    config.openDeadline || 0n,
    config.fillDeadline || 0n,
    toEncodedString(config.maxSpent_token || "", 32),
    config.maxSpent_amount || 0n,
    toEncodedString(config.maxSpent_recipient || "", 256),
    config.maxSpent_chainId || 0n,
    toEncodedString(config.minReceived_token || "", 32),
    config.minReceived_amount || 0n,
    toEncodedString(config.minReceived_recipient || "", 256),
    config.minReceived_chainId || 0n,
    config.destinationChainId || 0n,
    toEncodedString(config.destinationSettler || "", 32),
    toEncodedString(JSON.stringify(config.originData || {}), 256),
  );
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log(`Created intent ${config.orderId} for ${account}`);
  return { ...finalizedTxData.public, ...config };
};

const displayErc7683Value = async (
  providers: Erc7683Providers,
  erc7683Contract: DeployedErc7683Contract,
): Promise<{ state: any | null; contractAddress: string }> => {
  const contractAddress = erc7683Contract.deployTxData.public.contractAddress;
  const state = await getErc7683LedgerState(providers, contractAddress);
  return { contractAddress, state };
};

const getContractAddress = async (): Promise<string> => {
  const r = await fetch(
    `contract_address/erc7683.${MIDNIGHT_NETWORK_ID}.json`,
  );
  const json = await r.json();
  console.log("🔍 Contract address:", json.contractAddress);
  return json.contractAddress;
};

const fetchWalletAddresses = async (
  connectedAPI: ConnectedAPI,
): Promise<WalletAddresses> => {
  const [shieldedAddresses, unshielded, dust] = await Promise.all([
    connectedAPI.getShieldedAddresses(),
    connectedAPI.getUnshieldedAddress(),
    connectedAPI.getDustAddress(),
  ]);

  return {
    ...shieldedAddresses,
    unshieldedAddress: unshielded.unshieldedAddress,
    dustAddress: dust.dustAddress,
  };
};

const connectMidnightWallet = async (
  connectedAPI: ConnectedAPI,
): Promise<{
  providers: Erc7683Providers;
  addresses: WalletAddresses;
}> => {
  console.log("🔗 Building Midnight wallet with v4 connector...");

  const addresses = await fetchWalletAddresses(connectedAPI);
  const providers = await initializeProviders(connectedAPI, addresses);
  console.log("✅ Providers configured successfully");

  return { providers, addresses };
};

const connectToContract = async (
  providers: Erc7683Providers,
  contractAddress?: string,
): Promise<{
  contract: DeployedErc7683Contract;
  state: any | null;
  contractAddress: string;
}> => {
  const address = contractAddress || (await getContractAddress());
  console.log(
    `🔗 Joining multi chain multi token contract at address: ${address}`,
  );

  const erc7683Contract = await joinContract(providers, address);
  console.log("✅ Successfully joined the multi chain multi token contract");

  const currentState = await displayErc7683Value(providers, erc7683Contract);
  console.log(`📊 Current state value:`, currentState);

  return {
    contract: erc7683Contract,
    state: currentState.state,
    contractAddress: currentState.contractAddress,
  };
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
      console.log(" intents.ts: balanceTx called (delegated)", { tx, _ttl });

      const hexTx = toHex((tx as unknown as UnprovenTransaction).serialize());
      console.log(" intents.ts: Capturing UNPROVEN transaction for delegation", {
        hexTxLength: hexTx.length,
      });
      lastCapturedTx = hexTx;

      throw new DelegatedBalancingSentError();
    },
    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      console.log(" intents.ts: submitTx called (delegated)", { tx });
      throw new DelegatedBalancingSentError();
    },
  };
};

const initializeProviders = async (
  connectedAPI: ConnectedAPI,
  shieldedAddresses: ShieldedAddresses,
): Promise<Erc7683Providers> => {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = shieldedAddresses;

  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    connectedAPI,
    shieldedCoinPublicKey as any,
    shieldedEncryptionPublicKey as any,
  );

  const zkConfigPath = window.location.origin;

  // httpClientProofProvider needs the zkConfigProvider as its 2nd argument so
  // it can fetch prover key + zkir to build the /check and /prove payloads.
  const zkConfigProvider = new FetchZkConfigProvider(zkConfigPath, fetch.bind(window));

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
      accountId: shieldedCoinPublicKey || "default-account",
    } as any),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(BASE_URL_PROOF_SERVER, zkConfigProvider),
    publicDataProvider: wrapPublicDataProvider(
      indexerPublicDataProvider(
        BASE_URL_MIDNIGHT_INDEXER_API,
        BASE_URL_MIDNIGHT_INDEXER_WS,
      ),
      BASE_URL_MIDNIGHT_INDEXER_API,
      "intents.ts",
    ),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export {
  createIntent,
  connectMidnightWallet,
  connectToContract,
};
