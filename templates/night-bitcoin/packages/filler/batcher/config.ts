import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  type BatcherConfig,
  BitcoinAdapter,
  FileStorage,
  MidnightAdapter,
  MidnightBalancingAdapter,
} from "@paimaexample/batcher";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import {
  SimpleToken,
  witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";
import { midnightNetworkConfig } from "@paimaexample/midnight-contracts/midnight-env";

export const FILLER_BATCHER_DEFAULTS = {
  pollingInterval: 1000,
  storageRoot: "./batcher-data",
  midnightSeed:
    "0000000000000000000000000000000000000000000000000000000000000001",
  bitcoin: {
    rpcUrl: "http://127.0.0.1:18443",
    walletName: "default",
    rpcUser: "dev",
    rpcPass: "devpassword",
    seed: "night-bitcoin-filler-batcher",
  },
} as const;

export interface BitcoinOptions {
  rpcUrl: string;
  rpcUser: string;
  rpcPass: string;
  walletName?: string;
  seed?: string;
  batcherWif?: string;
}

export interface BatcherBuilderOptions {
  fillerName: string;
  batcherPort: number;
  pollingIntervalMs: number;
  storageRoot?: string;
  midnightSeed: string;
  bitcoin: BitcoinOptions;
}

export interface BatcherSetup {
  config: BatcherConfig;
  storage: FileStorage;
  adapters: {
    bitcoin: BitcoinAdapter;
    midnight: MidnightAdapter;
    midnightBalancing: MidnightBalancingAdapter;
  };
  namespace: string;
  storagePath: string;
}

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") ||
  "filler";

export function buildBatcherSetup(
  options: BatcherBuilderOptions,
): BatcherSetup {
  const namespace = slugify(options.fillerName);
  const storageRoot = options.storageRoot ??
    FILLER_BATCHER_DEFAULTS.storageRoot;
  const storagePath = join(storageRoot, namespace);
  mkdirSync(storagePath, { recursive: true });

  const bitcoinRpcUrl = options.bitcoin.walletName
    ? `${options.bitcoin.rpcUrl.replace(/\/$/, "")}/wallet/${options.bitcoin.walletName}`
    : options.bitcoin.rpcUrl;

  const bitcoinAdapter = new BitcoinAdapter({
    rpcUrl: bitcoinRpcUrl,
    rpcUser: options.bitcoin.rpcUser,
    rpcPass: options.bitcoin.rpcPass,
    seed: options.bitcoin.seed,
    batcherWif: options.bitcoin.batcherWif,
    syncProtocolName: "parallelBitcoin",
  });

  const {
    contractInfo,
    contractAddress,
    zkConfigPath,
  } = readMidnightContract(
    "unshielded-erc20",
    { networkId: midnightNetworkConfig.id }
  );

  const midnightAdapter = new MidnightAdapter(
    contractAddress,
    options.midnightSeed,
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      zkConfigPath,
      privateStateStoreName: "unshielded-erc20-private-state",
      privateStateId: "unshielded_erc20State",
      contractJoinTimeoutSeconds: 600,
      walletFundingTimeoutSeconds: 600,
    },
    new SimpleToken.Contract(witnesses),
    witnesses,
    contractInfo,
    midnightNetworkConfig.id,
    "parallelMidnight",
  );

  const midnightBalancingAdapter = new MidnightBalancingAdapter(
    contractAddress,
    options.midnightSeed,
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      zkConfigPath,
      privateStateStoreName: "unshielded-erc20-balancing-private-state",
      privateStateId: "unshielded_erc20BalancingState",
      contractJoinTimeoutSeconds: 600,
      walletFundingTimeoutSeconds: 600,
      circuitId: "initialize", // Default circuitId
    },
    new SimpleToken.Contract(witnesses),
    witnesses,
    contractInfo,
    midnightNetworkConfig.id,
    "parallelMidnight",
  );

  const config: BatcherConfig = {
    pollingIntervalMs: options.pollingIntervalMs,
    namespace,
    confirmationLevel: "wait-effectstream-processed",
    enableHttpServer: options.batcherPort > 0,
    enableEventSystem: true,
    port: options.batcherPort,
  };

  const storage = new FileStorage(storagePath);

  return {
    config,
    storage,
    adapters: {
      bitcoin: bitcoinAdapter,
      midnight: midnightAdapter,
      midnightBalancing: midnightBalancingAdapter,
    },
    namespace,
    storagePath,
  };
}
