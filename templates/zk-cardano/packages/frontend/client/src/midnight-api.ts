import {
  type ContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Ballot,
  type BallotPrivateState,
  createWitnesses,
} from "@zk-cardano/midnight-contract";
import { CompiledContract, type Contract } from "@midnight-ntwrk/compact-js";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

import {
  createMidnightProviderFromHandlers,
  createWalletProviderFromHandlers,
  type MidnightProvider,
  type MidnightProviders,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import {
  BASE_URL_MIDNIGHT_INDEXER_API,
  BASE_URL_MIDNIGHT_INDEXER_WS,
  BASE_URL_PROOF_SERVER,
  MIDNIGHT_NETWORK_ID,
  getMidnightNodeUrl,
} from "./config.ts";
import {
  LedgerParameters,
  Transaction,
  ZswapSecretKeys,
  DustSecretKey,
  shieldedToken,
  type CoinPublicKey,
  type EncPublicKey,
} from "@midnightntwrk/ledger-v9";

import { HDWallet, Roles, type Role } from "@midnightntwrk/wallet-sdk-hd";
import {
  type DefaultConfiguration,
  DefaultForkSchedule,
  WalletFacade,
} from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  type UnshieldedKeystore,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import {
  InMemoryTransactionHistoryStorage,
  NetworkId,
  ProtocolVersion,
  TransactionHistoryStorage,
  WalletTransaction,
} from "@midnightntwrk/wallet-sdk-abstractions";
import { Buffer } from "buffer";

const TTL_DURATION_MS = 60 * 60 * 1000;
const DUST_FEE_BLOCKS_MARGIN = 5;
const WALLET_SYNC_THROTTLE_MS = 10_000;
const WALLET_SYNC_TIMEOUT_MS = 300_000;

type BallotCircuits = Contract.ProvableCircuitId<Ballot.Contract<BallotPrivateState>>;
const BallotPrivateStateId = "ballotPrivateState";

type BallotProviders = MidnightProviders<
  BallotCircuits,
  typeof BallotPrivateStateId,
  BallotPrivateState
>;

type BallotContract = Ballot.Contract;
type DeployedBallotContract = DeployedContract<BallotContract> | FoundContract<BallotContract>;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  indexer = BASE_URL_MIDNIGHT_INDEXER_API;
  indexerWS = BASE_URL_MIDNIGHT_INDEXER_WS;
  node: string;
  proofServer = BASE_URL_PROOF_SERVER;
  constructor(nodeUrl: string) {
    this.node = nodeUrl;
  }
}

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

interface NetworkUrls {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
}

interface WalletResult {
  wallet: WalletFacade;
  zswapSecretKeys: ZswapSecretKeys;
  walletZswapSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  walletDustSecretKey: DustSecretKey;
  unshieldedAddress: string;
  unshieldedKeystore: UnshieldedKeystore;
}

function createTtl(): Date {
  return new Date(Date.now() + TTL_DURATION_MS);
}

function createWalletConfiguration(
  networkUrls: Required<NetworkUrls>,
  networkId: NetworkId.NetworkId,
): DefaultConfiguration {
  return {
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    provingServerUrl: new URL(networkUrls.proofServer),
    relayURL: new URL(networkUrls.node.replace("http", "ws")),
    networkId: networkId,
    costParameters: {
      feeBlocksMargin: DUST_FEE_BLOCKS_MARGIN,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      TransactionHistoryStorage.TransactionHistoryEntryCommonSchema,
    ),
  };
}

/** Derives the account-0 / index-0 key seed for one HD role. */
function deriveSeedForRole(seed: string, role: Role): Uint8Array {
  const hdResult = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdResult.type !== "seedOk") {
    throw new Error(`Failed to create HD wallet: ${hdResult.type}`);
  }
  const derivation = hdResult.hdWallet
    .selectAccount(0)
    .selectRole(role)
    .deriveKeyAt(0);
  hdResult.hdWallet.clear();
  if (derivation.type !== "keyDerived") {
    throw new Error(`Key derivation failed for role ${role}: ${derivation.type}`);
  }
  return Buffer.from(derivation.key);
}

async function buildWalletFacade(
  networkUrls: Required<NetworkUrls>,
  seed: string,
  networkId: NetworkId.NetworkId,
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: unshieldedSeed },
    networkId,
  );
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();

  const config = createWalletConfiguration(networkUrls, networkId);
  const dustParameters = LedgerParameters.initialParameters().dust;

  const wallet = await WalletFacade.init({
    configuration: config,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSeed(shieldedSeed),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSeed(dustSeed, dustParameters),
  });

  // wallet-sdk 2 starts every sub-wallet from its role seed.
  await wallet.start({
    shielded: shieldedSeed,
    unshielded: unshieldedSeed,
    dust: dustSeed,
  });

  return {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys: zswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey: dustSecretKey,
    unshieldedAddress,
    unshieldedKeystore,
  };
}

async function syncAndWaitForFunds(
  walletResult: WalletResult,
): Promise<{ shieldedBalance: bigint; dustBalance: bigint }> {
  console.log("Waiting for wallet to sync...");
  const wallet = walletResult.wallet;

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        const isSynced = state.isSynced ?? false;
        console.log(`Wallet sync: isSynced=${isSynced}`);
      }),
      Rx.filter((state: any) => {
        const isSynced = state.isSynced ?? false;
        const shieldedSynced = state.shielded?.state?.progress?.isStrictlyComplete() || isSynced;
        const dustSynced = state.dust?.state?.progress?.isStrictlyComplete() || isSynced;
        return shieldedSynced && dustSynced;
      }),
      Rx.timeout({
        each: WALLET_SYNC_TIMEOUT_MS,
        with: () =>
          Rx.throwError(() => new Error(`Wallet sync timeout after ${WALLET_SYNC_TIMEOUT_MS}ms`)),
      }),
    ),
  );

  const tokenObj = shieldedToken();
  const tokenId = tokenObj.raw;
  const shieldedBalance = state.shielded?.balances?.[tokenId] ?? 0n;
  const dustBalance = 0n;

  return { shieldedBalance, dustBalance };
}

// midnight-js 5 hands providers ledger-v9 transactions; wallet-sdk 2 takes and
// returns sealed `WalletTransaction` handles. The two helpers below convert
// between them at the protocol version the wallet is acting at. Both sides use
// the single `@midnightntwrk/ledger-v9` copy the package.json overrides pin.

async function walletProtocolVersion(
  wallet: WalletFacade,
): Promise<ProtocolVersion.ProtocolVersion> {
  return (await Rx.firstValueFrom(wallet.state())).activeProtocolVersion;
}

/** Seals a ledger-v9 transaction as a wallet-sdk handle at the active protocol version. */
async function adoptInWallet<S extends "Unbound" | "Finalized">(
  wallet: WalletFacade,
  stage: S,
  tx: { serialize(): Uint8Array },
): Promise<WalletTransaction<S>> {
  const bytes = tx.serialize();
  const decoded = stage === "Unbound"
    ? Transaction.deserialize("signature", "proof", "pre-binding", bytes)
    : Transaction.deserialize("signature", "proof", "binding", bytes);
  return WalletTransaction.adopt(stage, decoded, await walletProtocolVersion(wallet));
}

/** Reads the bytes of a finalized wallet-sdk handle sealed for the current epoch. */
async function finalizedFromWallet(
  wallet: WalletFacade,
  handle: WalletTransaction<"Finalized">,
): Promise<Uint8Array> {
  const epoch = ProtocolVersion.epochOf(
    await walletProtocolVersion(wallet),
    DefaultForkSchedule.v9,
  );
  const unwrapped = WalletTransaction.unwrapWithin<Transaction<any, any, any>>(handle, epoch);
  if (unwrapped._tag === "Left") throw unwrapped.left;
  return unwrapped.right.serialize();
}

function createWalletAndMidnightProvider(
  walletResult: WalletResult,
): { walletProvider: WalletProvider; midnightProvider: MidnightProvider } {
  const wallet = walletResult.wallet;
  const walletProvider = createWalletProviderFromHandlers({
    v8: undefined,
    v9: async (tx, ttl) => {
      const recipe = await wallet.balanceUnboundTransaction(
        await adoptInWallet(wallet, "Unbound", tx),
        { ttl: ttl ?? createTtl() },
      );
      const signed = await wallet.signRecipe(recipe, (payload) =>
        walletResult.unshieldedKeystore.signDataAsync(payload),
      );
      return finalizedFromWallet(wallet, await wallet.finalizeRecipe(signed));
    },
    getCoinPublicKey: (): CoinPublicKey => walletResult.zswapSecretKeys.coinPublicKey,
    getEncryptionPublicKey: (): EncPublicKey =>
      walletResult.zswapSecretKeys.encryptionPublicKey,
  });
  const midnightProvider = createMidnightProviderFromHandlers({
    v8: undefined,
    v9: async (tx) =>
      wallet.submitTransaction(await adoptInWallet(wallet, "Finalized", tx)),
  });
  return { walletProvider, midnightProvider };
}

const DEPLOYER_SECRET_KEY = new Uint8Array(32);
DEPLOYER_SECRET_KEY[31] = 0x01;
const voterKey = DEPLOYER_SECRET_KEY;
const witnesses = createWitnesses(voterKey);
const ballotContractInstance: BallotContract = new Ballot.Contract(witnesses);

const joinContract = async (
  providers: BallotProviders,
  contractAddress: string,
): Promise<DeployedBallotContract> => {
  const compiledContract = CompiledContract.make("contract-ballot", Ballot.Contract).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets("./"),
  );

  const ballotContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract,
    privateStateId: "ballotPrivateState",
    initialPrivateState: { secretKey: voterKey },
  });
  console.log(`Joined contract at address: ${ballotContract.deployTxData.public.contractAddress}`);
  return ballotContract;
};

const configureProviders = async (
  walletResult: WalletResult,
  config: Config,
): Promise<BallotProviders> => {
  const { walletProvider, midnightProvider } = createWalletAndMidnightProvider(walletResult);

  const privateStateProvider = levelPrivateStateProvider({
    privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
    accountId: walletResult.unshieldedAddress || "default-account",
  } as any);

  const publicDataProvider = indexerPublicDataProvider(
    config.indexer,
    config.indexerWS,
  );

  const zkConfigPath = window.location.origin;
  // Serves keys/, zkir/ and the compiler/ integrity manifest (see vite.config.ts).
  const zkConfigProvider = new FetchZkConfigProvider<BallotCircuits>(zkConfigPath, {
    fetchFunc: fetch.bind(window),
  });
  const proofProvider = httpClientProofProvider(config.proofServer, zkConfigProvider);

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
    config: {
      networkId: MIDNIGHT_NETWORK_ID,
      ttlSeconds: TTL_DURATION_MS / 1000,
    },
  };
};

const getContractAddress = async (): Promise<string> => {
  const candidates = [
    `contract_address/contract-ballot.${MIDNIGHT_NETWORK_ID}.json`,
    `contract_address/contract-ballot.json`,
    `contract_address/contract.json`,
  ];

  for (const candidate of candidates) {
    try {
      const r = await fetch(candidate);
      if (!r.ok) continue;
      const json = await r.json();
      if (typeof json.contractAddress === "object") {
        const address = json.contractAddress[MIDNIGHT_NETWORK_ID];
        if (address) return address;
        continue;
      }
      if (json.contractAddress) return json.contractAddress;
    } catch {
      // try next
    }
  }

  throw new Error(`Could not resolve contract address for network ${MIDNIGHT_NETWORK_ID}`);
};

let globalProviders: BallotProviders | null = null;
let globalBallotContract: DeployedBallotContract | null = null;

export const connectMidnightWallet = async (): Promise<{
  wallet: WalletFacade;
  providers: BallotProviders;
  address: string;
}> => {
  console.log("Building Midnight wallet with genesis seed...");

  const midnightNodeUrl = await getMidnightNodeUrl();
  const config = new StandaloneConfig(midnightNodeUrl);

  const networkUrls = {
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    proofServer: config.proofServer,
  };

  const networkId = MIDNIGHT_NETWORK_ID as NetworkId.NetworkId;
  const walletResult = await buildWalletFacade(networkUrls, GENESIS_MINT_WALLET_SEED, networkId);
  console.log("Wallet built successfully");

  const { shieldedBalance, dustBalance } = await syncAndWaitForFunds(walletResult);
  console.log(`Wallet synced. Shielded: ${shieldedBalance}, Dust: ${dustBalance}`);

  const providers = await configureProviders(walletResult, config);
  console.log("Providers configured");

  const walletFacade = walletResult.wallet;
  globalProviders = providers;

  return { wallet: walletFacade as any, providers, address: walletResult.unshieldedAddress };
};

export const connectToContract = async (
  providers: BallotProviders,
  contractAddress?: string,
): Promise<DeployedBallotContract> => {
  const address = contractAddress || (await getContractAddress());
  console.log(`Joining ballot contract at address: ${address}`);

  const ballotContract = await joinContract(providers, address);
  console.log("Successfully joined the ballot contract");

  globalBallotContract = ballotContract;
  return ballotContract;
};

export const castVote = async (
  proposalId: number,
  voteYes: boolean,
  contract?: DeployedBallotContract,
): Promise<any> => {
  const actualContract = contract || globalBallotContract;
  if (!actualContract) throw new Error("Contract must be joined first");

  console.log(`Casting vote: proposal=${proposalId}, yes=${voteYes}`);
  const proposalIdBytes = new Uint8Array(32);
  proposalIdBytes[31] = proposalId & 0xff;
  proposalIdBytes[30] = (proposalId >> 8) & 0xff;
  proposalIdBytes[29] = (proposalId >> 16) & 0xff;
  proposalIdBytes[28] = (proposalId >> 24) & 0xff;
  const result = await actualContract.callTx.cast_vote(
    BigInt(proposalId),
    proposalIdBytes,
    voteYes,
  );
  console.log(`Vote cast. TX: ${result.public.txId}`);
  return result.public;
};

export const createProposal = async (
  text: string,
  contract?: DeployedBallotContract,
): Promise<any> => {
  const actualContract = contract || globalBallotContract;
  if (!actualContract) throw new Error("Contract must be joined first");

  console.log(`Creating proposal: "${text}"...`);
  const result = await actualContract.callTx.create_proposal(text);
  console.log(`Proposal created. TX: ${result.public.txId}`);
  return result.public;
};

export const closeProposal = async (
  proposalId: number,
  contract?: DeployedBallotContract,
): Promise<any> => {
  const actualContract = contract || globalBallotContract;
  if (!actualContract) throw new Error("Contract must be joined first");

  console.log(`Closing proposal ${proposalId}...`);
  const result = await actualContract.callTx.close_proposal(BigInt(proposalId));
  console.log(`Proposal closed. TX: ${result.public.txId}`);
  return result.public;
};
