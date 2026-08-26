import {
  type ContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Ballot,
  type BallotPrivateState,
  createWitnesses,
} from "@zk-cardano/midnight-contract";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import {
  type TransactionId,
} from "@midnightntwrk/ledger-v9";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

import {
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnboundTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import {
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import {
  BASE_URL_MIDNIGHT_INDEXER_API,
  BASE_URL_MIDNIGHT_INDEXER_WS,
  BASE_URL_PROOF_SERVER,
  MIDNIGHT_NETWORK_ID,
  getMidnightNodeUrl,
} from "./config.ts";
import {
  LedgerParameters,
  ZswapSecretKeys,
  DustSecretKey,
  shieldedToken,
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
} from "@midnightntwrk/ledger-v9";

import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
import { type DefaultConfiguration, WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
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
  TransactionHistoryStorage,
} from "@midnightntwrk/wallet-sdk-abstractions";
import { Buffer } from "buffer";

const TTL_DURATION_MS = 60 * 60 * 1000;
const DUST_FEE_BLOCKS_MARGIN = 5;
const WALLET_SYNC_THROTTLE_MS = 10_000;
const WALLET_SYNC_TIMEOUT_MS = 300_000;

type BallotCircuits = ImpureCircuitId<Ballot.Contract<BallotPrivateState>>;
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
    setNetworkId(MIDNIGHT_NETWORK_ID as any);
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
      TransactionHistoryStorage.TransactionHistoryCommonSchema,
    ),
  };
}

async function buildWalletFacade(
  networkUrls: Required<NetworkUrls>,
  seed: string,
  networkId: NetworkId.NetworkId,
): Promise<WalletResult> {
  const seedBuffer = Buffer.from(seed, "hex");
  const hdResult = HDWallet.fromSeed(seedBuffer);
  if (hdResult.type !== "seedOk") {
    throw new Error(`Failed to create HD wallet: ${hdResult.type}`);
  }
  const derivation = hdResult.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derivation.type !== "keysDerived") {
    throw new Error(`Key derivation failed: ${derivation.type}`);
  }
  hdResult.hdWallet.clear();

  const shieldedSeed = Buffer.from(derivation.keys[Roles.Zswap]);
  const dustSeed = Buffer.from(derivation.keys[Roles.Dust]);
  const unshieldedSeed = Buffer.from(derivation.keys[Roles.NightExternal]);

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();

  const config = createWalletConfiguration(networkUrls, networkId);
  const dustParameters = LedgerParameters.initialParameters().dust;

  const wallet = await WalletFacade.init({
    configuration: config,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(zswapSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(dustSecretKey, dustParameters),
  });

  await wallet.start(zswapSecretKeys, dustSecretKey);

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

function createWalletAndMidnightProvider(
  walletResult: WalletResult,
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return walletResult.zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return walletResult.zswapSecretKeys.encryptionPublicKey;
    },
    async balanceTx(
      tx: UnboundTransaction,
      ttl?: Date,
    ): Promise<FinalizedTransaction> {
      const recipe = await walletResult.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletResult.walletZswapSecretKeys, dustSecretKey: walletResult.walletDustSecretKey },
        { ttl: ttl ?? createTtl() },
      );
      const signed = await walletResult.wallet.signRecipe(recipe, (payload) =>
        walletResult.unshieldedKeystore.signDataAsync(payload),
      );
      return walletResult.wallet.finalizeRecipe(signed);
    },
    submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      return walletResult.wallet.submitTransaction(tx);
    },
  };
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
    compiledContract: compiledContract as any,
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
  const walletAndMidnightProvider = createWalletAndMidnightProvider(walletResult);

  const privateStateProvider = levelPrivateStateProvider({
    privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
    accountId: walletResult.unshieldedAddress || "default-account",
  } as any);

  const publicDataProvider = indexerPublicDataProvider(
    config.indexer,
    config.indexerWS,
  );

  const zkConfigPath = window.location.origin;
  const zkConfigProvider = new FetchZkConfigProvider(
    zkConfigPath,
    fetch.bind(window),
  );
  const proofProvider = httpClientProofProvider(config.proofServer, zkConfigProvider);

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
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
