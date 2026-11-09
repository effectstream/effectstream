// ── External SDK: ledger / runtime ────────────────────────────────────────
import { CompiledContract, type Contract } from "@midnight-ntwrk/compact-js";
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
import {
  createMidnightProviderFromHandlers,
  createWalletProviderFromHandlers,
  type MidnightProvider,
  type MidnightProviders,
  type NetworkId,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";

// ── External SDK: wallet ──────────────────────────────────────────────────
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { ContractState } from "@midnightntwrk/ledger-v9";
// ── Misc third-party ──────────────────────────────────────────────────────
import semver from "semver";

// ── Workspace ─────────────────────────────────────────────────────────────
import {
  SimpleToken,
  witnesses as unshielded_erc20Witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";

// ── Local ─────────────────────────────────────────────────────────────────
import { wrapPublicDataProvider } from "./midnight-utils.ts";

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
const BASE_URL_MIDNIGHT_INDEXER_API = `${BASE_URL_MIDNIGHT_INDEXER}/api/v4/graphql`;
const BASE_URL_MIDNIGHT_INDEXER_WS = `${BASE_WS_MIDNIGHT_INDEXER}/api/v4/graphql/ws`;

export class DelegatedBalancingSentError extends Error {
  constructor() {
    super("Delegated balancing flow handed off to batcher");
    // Set explicitly so `error.name === "DelegatedBalancingSentError"` is a
    // reliable fallback when `instanceof` fails across module boundaries
    // (e.g. after Vite HMR or when midnight-js re-wraps the error chain).
    this.name = "DelegatedBalancingSentError";
  }
}

let lastCapturedTx: string | null = null;
export const getLastCapturedTx = () => lastCapturedTx;

const toHex = (data: Uint8Array): string =>
  Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

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
type SimpleTokenCircuits = Contract.ProvableCircuitId<SimpleToken.Contract>;

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
      contractState != null
        ? SimpleToken.ledger(
          contractState.contractState.deserialize({ v9: ContractState }).data,
        )
        : null;
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
    compiledContract,
    privateStateId: "simpleTokenPrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${(simpleTokenContract as any).deployTxData.public.contractAddress}`,
  );
  return simpleTokenContract;
};

// Static per-template domain separator for the M20 unshielded token color.
// Must match the constant used by the filler (see packages/filler/index.ts).
export const M20_DOMAIN_SEP = new Uint8Array(32).fill(0x20);

const wrapAddress = (bytes: Uint8Array) => {
  if (bytes.length !== 32) {
    throw new Error(
      `wrapAddress: expected a 32-byte ZswapCoinPublicKey, got ${bytes.length} bytes`,
    );
  }
  return {
    is_left: true,
    left: { bytes },
    right: { bytes: new Uint8Array(32) },
  };
};

// Mints native unshielded M20 coins to `recipientBytes` (the user's 32-byte
// unshielded UserAddress). Returns the finalized tx data, which includes the
// token color in `txData.result` (see mint_unshielded circuit return type).
const mintUnshielded = async (
  simpleTokenContract: DeployedSimpleTokenContract,
  recipientBytes: Uint8Array,
  amount: bigint,
): Promise<any> => {
  if (recipientBytes.length !== 32) {
    throw new Error(
      `mintUnshielded: expected a 32-byte UserAddress, got ${recipientBytes.length} bytes`,
    );
  }
  console.log("Minting unshielded...", { amount });
  // Compact runtime requires Bytes<N> as Uint8Array (not a plain JS number[]),
  // and UserAddress.bytes likewise. Array.from() would coerce to plain array
  // and trip a "type error" inside the circuit.
  lastCapturedTx = null;
  let finalizedTxData;
  try {
    finalizedTxData = await (simpleTokenContract.callTx as any).mint_unshielded(
      M20_DOMAIN_SEP,
      amount,
      { bytes: recipientBytes },
    );
  } catch (error) {
    // midnight-js 5 wraps the provider's DelegatedBalancingSentError in
    // ProviderFailedError; the captured transaction marks the hand-off.
    if (lastCapturedTx !== null) throw new DelegatedBalancingSentError();
    throw error;
  }
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log(`Minted ${amount} unshielded M20 tokens`);
  return finalizedTxData.public;
};

// Transfers of M20 between users are native Midnight unshielded coin moves —
// not a Compact circuit call — so we cannot use callTx.
//
// Lace's dapp-connector APIs (both makeTransfer and makeIntent) always return
// a FINALIZED transaction with header `proof,pedersen-schnorr` — the wallet
// generates the ZK proofs and binding internally before returning. There is no
// API to obtain a `proof-preimage,embedded-fr` (unproven) tx from Lace.
//
// The batcher's MidnightBalancingAdapter handles this case via
// wallet.balanceFinalizedTransaction(), but ONLY when the submitter explicitly
// passes txStage:"finalized" (auto-detect never tries that stage). See the
// "finalized" hint we pass from m20_transferFrom in interface.ts.
//
// We use makeTransfer (not makeIntent) since the wallet auto-selects input
// UTXOs from the user's M20 balance and the API is simpler.
const transferFrom = async (
  connectedAPI: ConnectedAPI,
  tokenColor: string,           // hex M20 raw token type (from m20TokenColor())
  toUnshieldedAddress: string,  // filler's bech32m mn_addr_... address
  amount: bigint,
): Promise<never> => {
  console.log("🚀 erc20.ts: transferFrom via balancing batcher (makeTransfer)", {
    tokenColor,
    toUnshieldedAddress,
    amount,
  });
  // payFees:false → Lace does not add dust to the tx, leaving the M20 transfer
  // unbalanced w.r.t. fees. The batcher's balanceFinalizedTransaction() will
  // attach its dust UTXOs so the user does not need DUST in their wallet.
  const result = await connectedAPI.makeTransfer(
    [{ kind: "unshielded", type: tokenColor, value: amount, recipient: toUnshieldedAddress }],
    { payFees: false },
  );
  // Mirror the balanceTx interception used by the mint circuit: stash the tx
  // hex so the delegation handler in interface.ts can submit it to the batcher.
  lastCapturedTx = result.tx;
  throw new DelegatedBalancingSentError();
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

/**
 * Wallet and midnight providers for the delegated-balancing flow (ledger-v9
 * only): the unbound transaction midnight-js hands to `balanceTx` is captured
 * for the balancing batcher instead of being balanced by the user's wallet.
 * midnight-js 5 wraps whatever a provider throws in `ProviderFailedError`, so
 * callers recognise the hand-off by the captured transaction (see
 * `getLastCapturedTx`), not by the class of the error thrown here.
 */
const createWalletAndMidnightProvider = (
  coinPublicKey: string,
  encryptionPublicKey: string,
): { walletProvider: WalletProvider; midnightProvider: MidnightProvider } => {
  const walletProvider = createWalletProviderFromHandlers({
    v8: undefined,
    v9: async (tx) => {
      const hexTx = toHex(tx.serialize());
      console.log(" erc20.ts: Capturing UNBOUND transaction for delegation", {
        hexTxLength: hexTx.length,
      });
      lastCapturedTx = hexTx;
      throw new DelegatedBalancingSentError();
    },
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
  });
  const midnightProvider = createMidnightProviderFromHandlers({
    v8: undefined,
    v9: async () => {
      console.log(" erc20.ts: submitTx called (delegated)");
      throw new DelegatedBalancingSentError();
    },
  });
  return { walletProvider, midnightProvider };
};

const initializeProviders = async (
  connectedAPI: ConnectedAPI,
  shieldedAddresses: ShieldedAddresses,
): Promise<SimpleTokenProviders> => {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = shieldedAddresses;

  const { walletProvider, midnightProvider } = createWalletAndMidnightProvider(
    shieldedCoinPublicKey,
    shieldedEncryptionPublicKey,
  );

  // This contract's keys/, zkir/ and compiler/ are served under /unshielded-erc20/
  // (see vite.config.ts).
  const zkConfigPath = `${window.location.origin}/unshielded-erc20`;

  // httpClientProofProvider needs the zkConfigProvider as its 2nd argument so
  // it can fetch prover key + zkir to build the /check and /prove payloads.
  // Without it, getKeyMaterial silently returns undefined and the proof server
  // rejects /check with a 400 (no IR in the payload).
  const zkConfigProvider = new FetchZkConfigProvider<SimpleTokenCircuits>(zkConfigPath, {
    fetchFunc: fetch.bind(window),
  });

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
      "erc20.ts",
    ),
    walletProvider,
    midnightProvider,
    config: {
      networkId: MIDNIGHT_NETWORK_ID,
      ttlSeconds: 60 * 60,
    },
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
  mintUnshielded,
  transferFrom,
  connectMidnightWallet,
  connectToContract,
};
