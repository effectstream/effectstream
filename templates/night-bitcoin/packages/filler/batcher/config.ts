import { ensureDirSync } from "@std/fs/ensure_dir.ts";
import { join } from "@std/path/join";
import {
  type BatcherConfig,
  BitcoinAdapter,
  FileStorage,
  MidnightAdapter,
} from "@paimaexample/batcher";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import {
  SimpleToken,
  witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";
import { NetworkId } from "@midnight-ntwrk/compact-runtime";

export const FILLER_BATCHER_DEFAULTS = {
  pollingInterval: 1000,
  storageRoot: "./batcher-data",
  midnightSeed:
    "0000000000000000000000000000000000000000000000000000000000000001",
  bitcoin: {
    rpcUrl: "http://127.0.0.1:18443",
    rpcUser: "dev",
    rpcPass: "devpassword",
    seed: "night-bitcoin-filler-batcher",
  },
} as const;

export interface BitcoinOptions {
  rpcUrl: string;
  rpcUser: string;
  rpcPass: string;
  seed: string;
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
  ensureDirSync(storagePath);

  const bitcoinAdapter = new BitcoinAdapter({
    rpcUrl: options.bitcoin.rpcUrl,
    rpcUser: options.bitcoin.rpcUser,
    rpcPass: options.bitcoin.rpcPass,
    seed: options.bitcoin.seed,
  });

  const {
    contractInfo,
    contractAddress,
    zkConfigPath,
  } = readMidnightContract(
    "unshielded-erc20",
    "contract-unshielded-erc20.json",
  );

  const midnightAdapter = new MidnightAdapter(
    contractAddress,
    options.midnightSeed,
    {
      indexer: "http://localhost:8088/api/v1/graphql",
      indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
      node: "http://localhost:9944",
      proofServer: "http://localhost:6300",
      zkConfigPath,
      privateStateStoreName: "multichain_multitoken-private-state",
      privateStateId: "multiChainMultiTokenPrivateState",
    },
    new SimpleToken.Contract(witnesses),
    witnesses,
    contractInfo,
    NetworkId.Undeployed,
    "parallelMidnight",
  );

  const config: BatcherConfig = {
    pollingIntervalMs: options.pollingIntervalMs,
    namespace,
    confirmationLevel: "wait-effectstream-processed",
    enableHttpServer: true,
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
    },
    namespace,
    storagePath,
  };
}
