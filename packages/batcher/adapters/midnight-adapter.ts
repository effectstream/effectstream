// Midnight blockchain adapter for the EffectStream batcher
// Handles transaction submission to Midnight contracts via circuit invocation
//
// Multi-wallet support: accepts one or more wallet seeds. Each wallet maintains
// its own dust UTXOs and contract instance. Requests are distributed across
// wallets via round-robin for higher throughput and resilience.

import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";
import type { ContractInfo } from "./midnight-arg-parser.ts";
import { parseCircuitArgs } from "./midnight-arg-parser.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { MidnightBatchBuilderLogic, type MidnightBatchPayload } from "../batch-data-builder/midnight-builder-logic.ts";
import { hexStringToUint8Array } from "@effectstream/utils";
import type {
  UnboundTransaction,
  // BalancedProvingRecipe,
  MidnightProvider,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  CoinPublicKey,
  DustSecretKey,
  EncPublicKey,
  FinalizedTransaction,
  ShieldedCoinInfo,
  TransactionId,
  UnprovenTransaction,
  ZswapSecretKeys,
} from "@midnightntwrk/ledger-v9";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import {
  NodeZkConfigProvider,
  nodeZkConfigRegistry,
} from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  getInitialDustState,
  type NetworkUrls,
  registerNightForDust,
  resolveFacadeDustAvailableCoins,
  resolveFacadeDustBalance,
  suspendAuxWalletSyncForFees,
  waitForDustFunds,
  waitForDustFundsWithRetry,
  type NetworkUrls as MidnightNetworkUrls,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import * as Rx from "rxjs";
import type { NetworkId as WalletNetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { Buffer } from "node:buffer";
import * as path from "node:path";
import { AdapterLogger } from "./adapter-logger.ts";
import { WorkerPool } from "./worker-pool.ts";

export interface MidnightAdapterConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  zkConfigPath: string;
  contractName: string; // Compact contract name used in CompiledContract.make (e.g. 'contract-eip-20')
  privateStateStoreName: string; // LevelDB store name (local)
  privateStateId?: string; // Contract private state ID (on-chain), defaults to privateStateStoreName if not provided
  contractJoinTimeoutSeconds?: number; // Defaults to 120 seconds
  walletFundingTimeoutSeconds?: number; // Defaults to 600 seconds
  callTxTimeoutSeconds?: number; // Defaults to 120 seconds — prevents hung callTx from blocking the batch queue forever
  walletNetworkId?: WalletNetworkId.NetworkId; // Optional override for modular wallet network id
  walletResult?: WalletResult | Promise<WalletResult>;
  // Maximum number of worker slots (concurrent txs) per wallet. Defaults to 1.
  // Regardless of how many dust UTXOs a wallet has, at most this many will be used in parallel.
  maxSlotsPerWallet?: number;
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const SPECKS_PER_DUST = 1_000_000_000_000_000n; // 1 DUST = 10^15 Specks
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

const DUST_REGISTRATION_PRECHECK_TIMEOUT_MS = 60_000;

function formatDust(specks: bigint): string {
  const abs = specks < 0n ? -specks : specks;
  const sign = specks < 0n ? "-" : "";
  const whole = abs / SPECKS_PER_DUST;
  const frac = abs % SPECKS_PER_DUST;
  const fracStr = frac.toString().padStart(15, "0").replace(/0+$/, "");
  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

/**
 * Midnight blockchain adapter implementing BlockchainAdapter interface
 * Enables batcher to submit transactions by invoking Compact contract circuits
 *
 * Supports multiple wallets for higher throughput: each wallet has its own
 * dust UTXOs and contract instance, with round-robin request distribution.
 */
export class MidnightAdapter<TContract> implements BlockchainAdapter<MidnightBatchPayload | null> {
  private readonly contractAddress: string;
  private readonly config: MidnightAdapterConfig;
  private readonly contractInfo: ContractInfo;
  private readonly syncProtocolName: string;
  public readonly maxBatchSize?: number;
  private readonly contractClass: TContract;
  private readonly log: AdapterLogger;

  // Private helper for building batch data
  private readonly batchBuilderLogic = new MidnightBatchBuilderLogic();

  // Per-wallet state (arrays indexed by wallet index)
  private readonly walletSeeds: string[];
  private walletResults: (WalletResult | null)[];
  private walletProviders: ((WalletProvider & MidnightProvider) | null)[];
  private deployedContracts: (any | null)[];
  private publicDataProvider: any | null = null;
  private hasFundsPerWallet: boolean[];
  private lastFundingBalancesPerWallet:
    ({ shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint } | null)[];
  private walletAddresses: (string | null)[];
  private walletInitialized: boolean[];
  private contractsJoined: boolean[];
  private contractJoiningPromises: (Promise<void> | null)[];

  /** Worker pool; state-changing callTx lifecycles are serialized per wallet. */
  private readonly pool: WorkerPool;
  /** Tracks wallets that recently failed due to missing dust. Cleared when dust is confirmed available. */
  private walletDustExhausted: boolean[];
  /** Input keys currently being processed in a concurrent batch.
   *  Prevents the same input from being picked up by multiple poll ticks. */
  private readonly inFlightInputKeys = new Set<string>();

  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private witnesses: any = null;
  private readonly contractJoinTimeoutMs: number;
  private readonly walletFundingTimeoutMs: number;
  private readonly callTxTimeoutMs: number;
  private readonly walletNetworkId: WalletNetworkId.NetworkId;

  /**
   * Wait for at least one dust UTXO to become available.
   * Handles the UTXO regeneration race where a worker is reused right after
   * its previous tx confirms but the change output hasn't been indexed yet.
   * Does not throw — if dust remains unavailable the subsequent callTx
   * will fail and the input goes back to the retry queue.
   */
  private async waitForDustAvailability(
    walletIndex: number,
    timeoutMs: number = 60_000,
  ): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    try {
      const dustState = await getInitialDustState(walletResult.wallet.dust);
      if (resolveFacadeDustAvailableCoins(dustState) > 0) {
        this.walletDustExhausted[walletIndex] = false;
        return;
      }
    } catch {
      return;
    }

    this.log.log(
      `Wallet ${label}: no dust UTXOs yet, waiting up to ${timeoutMs}ms for regeneration...`,
    );
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 1_000));
      try {
        const dustState = await getInitialDustState(walletResult.wallet.dust);
        if (resolveFacadeDustAvailableCoins(dustState) > 0) {
          this.log.log(
            `Wallet ${label}: dust available after ${Date.now() - start}ms`,
          );
          this.walletDustExhausted[walletIndex] = false;
          return;
        }
      } catch {
        // Keep polling
      }
    }
    this.walletDustExhausted[walletIndex] = true;
    this.log.warn(
      `Wallet ${label}: dust still unavailable after ${timeoutMs}ms, proceeding to callTx (will likely fail and re-queue)`,
    );
  }

  private async logDustState(context: string, walletIndex: number): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    try {
      const dustState = await getInitialDustState(
        walletResult.wallet.dust as { state: Rx.Observable<unknown> },
        { timeoutMs: 30_000 },
      );
      const bal = resolveFacadeDustBalance(dustState);
      const available = (dustState as { availableCoins?: unknown[] }).availableCoins?.length ?? 0;
      this.log.log(
        `[${context}] Wallet ${walletIndex + 1} dust: balance=${bal} availableCoins=${available}`,
      );
    } catch (error) {
      this.log.warn(`[${context}] Wallet ${walletIndex + 1} failed to read dust state:`, error);
    }
  }

  constructor(
    contractAddress: string,
    walletSeed: string | string[],
    config: MidnightAdapterConfig,
    contractClass: TContract,
    witnesses: any,
    contractInfo: ContractInfo,
    syncProtocolName: string,
    maxBatchSize: number = 10000,
  ) {
    const seeds = Array.isArray(walletSeed) ? walletSeed : [walletSeed];
    this.walletSeeds = seeds;
    this.contractAddress = contractAddress;
    this.config = config;
    this.contractInfo = contractInfo;
    this.syncProtocolName = syncProtocolName;
    this.maxBatchSize = maxBatchSize;
    this.contractClass = contractClass;
    this.log = new AdapterLogger("midnight");
    this.contractJoinTimeoutMs = (config.contractJoinTimeoutSeconds ?? 120) * 1000;
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 600) * 1000;
    this.callTxTimeoutMs = (config.callTxTimeoutSeconds ?? 120) * 1000;
    this.walletNetworkId = config.walletNetworkId ?? "undeployed" as WalletNetworkId.NetworkId;

    // Store contract info for lazy joining
    this.witnesses = witnesses;

    // Initialize per-wallet arrays
    this.walletResults = new Array(seeds.length).fill(null);
    this.walletProviders = new Array(seeds.length).fill(null);
    this.deployedContracts = new Array(seeds.length).fill(null);
    this.walletAddresses = new Array(seeds.length).fill(null);
    this.walletInitialized = new Array(seeds.length).fill(false);
    this.hasFundsPerWallet = new Array(seeds.length).fill(false);
    this.lastFundingBalancesPerWallet = new Array(seeds.length).fill(null);
    this.contractsJoined = new Array(seeds.length).fill(false);
    this.contractJoiningPromises = new Array(seeds.length).fill(null);
    this.walletDustExhausted = new Array(seeds.length).fill(false);

    // Default 1 worker per wallet. Higher configured slot counts may queue
    // concurrent requests, but the wallet lock still serializes each complete
    // state-changing callTx lifecycle (balance + prove + submit).
    const slotsPerWallet = config.maxSlotsPerWallet ?? 1;
    this.pool = new WorkerPool(new Array(seeds.length).fill(slotsPerWallet));

    // Start async initialization but don't await
    this.initializationPromise = this.initialize();
  }

  /**
   * Initialize all wallets and providers in parallel.
   * The adapter is ready if at least one wallet initializes successfully.
   */
  private async initialize(): Promise<void> {
    try {
      this.log.log(`Initializing Midnight Adapter (${this.walletSeeds.length} wallet(s))...`);
      // Use lowercase network ID to match the wallet SDK expectations
      // This is consistent with the working e2e tests and manual scripts
      setNetworkId(this.walletNetworkId as any);

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

      // Initialize all wallets in parallel
      await Promise.all(
        this.walletSeeds.map((seed, i) => this.initializeWallet(i, seed)),
      );

      const readyCount = this.walletInitialized.filter(Boolean).length;
      if (readyCount === 0) {
        throw new Error("All wallets failed to initialize");
      }

      // NOTE: We skip joining the contract during initialization to avoid long startup times
      // The contract will be joined lazily when the first transaction is submitted
      this.log.log(`Contract join deferred until first transaction (lazy join)`);
      this.log.log(`Midnight adapter initialized (${readyCount}/${this.walletSeeds.length} wallets)`);

      this.isInitialized = true;
    } catch (error) {
      this.log.error(`Failed to initialize Midnight adapter:`, error);
      throw error;
    }
  }

  private async initializeWallet(index: number, seed: string): Promise<void> {
    const label = `${index + 1}/${this.walletSeeds.length}`;
    try {
      if (index === 0 && this.config.walletResult) {
        this.log.log(`Wallet ${label}: using shared wallet...`);
        this.walletResults[index] = await this.config.walletResult;

        this.walletAddresses[index] = this.walletResults[index]!.zswapSecretKeys.coinPublicKey.toString();
        this.walletProviders[index] = this.createWalletAndMidnightProvider(this.walletResults[index]!);

        this.log.log(`Wallet ${label}: waiting for funds...`);
        await this.ensureWalletFunds(index);

        // Stop shielded/unshielded after dust is resolved (registration may need unshielded)
        await suspendAuxWalletSyncForFees(this.walletResults[index]!.wallet);
      } else {
        this.log.log(`Wallet ${label}: building with retry-aware dust sync...`);
        const networkUrls: Required<NetworkUrls> = {
          id: this.walletNetworkId,
          indexer: this.config.indexer,
          indexerWS: this.config.indexerWS,
          node: this.config.node,
          proofServer: this.config.proofServer,
        };

        // Use waitForDustFundsWithRetry: builds wallet, restores cached state,
        // syncs with stall detection + retry, saves state to disk
        const { walletResult, dustBalance } = await waitForDustFundsWithRetry({
          networkUrls,
          seed,
          networkId: this.walletNetworkId,
          syncMode: 'dust-only',
          balanceWaitTimeoutMs: this.walletFundingTimeoutMs,
        });

        this.walletResults[index] = walletResult;

        this.lastFundingBalancesPerWallet[index] = {
          shieldedBalance: 0n,
          unshieldedBalance: 0n,
          dustBalance,
        };
        this.hasFundsPerWallet[index] = dustBalance > 0n;

        const wr = walletResult;
        this.walletAddresses[index] = wr.zswapSecretKeys.coinPublicKey.toString();
        this.walletProviders[index] = this.createWalletAndMidnightProvider(wr);

        if (dustBalance > 0n) {
          this.log.log(`Wallet ${label}: dust balance: ${dustBalance}`);
        } else {
          this.log.warn(
            `Wallet ${label}: dust balance still 0 — wallet needs dust or unshielded NIGHT to register`,
          );
        }
      }

      const wr = this.walletResults[index]!;
      this.log.log(`Wallet ${label} addresses:`);
      this.log.log(`  shielded:   ${this.walletAddresses[index]}`);
      this.log.log(`  unshielded: ${wr.unshieldedAddress}`);
      this.log.log(`  dust:       ${wr.dustAddress}`);
      this.log.log(`Wallet ${label}: dust balance: ${this.lastFundingBalancesPerWallet[index]?.dustBalance ?? "unknown"}`);

      await this.logDustState("initialize", index);

      this.walletInitialized[index] = true;
      this.log.log(`Wallet ${label}: ready`);
    } catch (error) {
      this.log.error(`Wallet ${label}: initialization failed:`, error);
      // Don't re-throw — let other wallets continue initializing
    }
  }

  /**
   * Join the contract lazily for a specific wallet (after wallet is synced and ready).
   */
  private async ensureContractJoined(walletIndex: number): Promise<void> {
    // If already joined, return immediately
    if (this.contractsJoined[walletIndex]) {
      return;
    }

    // If already joining, wait for existing join to complete
    if (this.contractJoiningPromises[walletIndex]) {
      this.log.log(`Wallet ${walletIndex + 1}: contract join already in progress, waiting...`);
      await this.contractJoiningPromises[walletIndex];
      return;
    }

    // Guard against concurrent join attempts
    if (!this.walletResults[walletIndex] || !this.walletProviders[walletIndex]) {
      throw new Error(`Cannot join contract: wallet ${walletIndex + 1} not initialized`);
    }

    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    // Start the join process
    this.contractJoiningPromises[walletIndex] = (async () => {
      try {
        this.log.log(`Wallet ${label}: configuring providers for contract join...`);

        const walletAndMidnightProvider = this.walletProviders[walletIndex]!;

        const zkConfigProvider = new NodeZkConfigProvider(
          this.config.zkConfigPath,
          { verify: "require" },
        );
        // Midnight.js 5 resolves proof artifacts by verifier key through a
        // registry. Search from the managed-artifact parent so sibling
        // contracts used by cross-contract calls are available as well.
        const zkConfigRegistry = await nodeZkConfigRegistry(
          path.dirname(this.config.zkConfigPath),
        );
        const providers = {
          privateStateProvider: levelPrivateStateProvider({
            privateStateStoreName: this.config.privateStateStoreName,
            privateStoragePasswordProvider: async () => "YourPasswordMy1!",
            accountId: Buffer.from(this.walletResults[walletIndex]!.zswapSecretKeys.coinPublicKey).toString('hex'),
          }),
          publicDataProvider: this.publicDataProvider,
          zkConfigProvider,
          proofProvider: httpClientProofProvider(
            this.config.proofServer,
            zkConfigRegistry,
          ),
          walletProvider: walletAndMidnightProvider,
          midnightProvider: walletAndMidnightProvider,
        };

        this.log.log(`Wallet ${label}: joining contract at address: ${this.contractAddress}`);

        // Check if indexer is responding before attempting to join
        try {
          this.log.log(`Wallet ${label}: checking indexer health...`);
          const blockQuery = `query { block { height } }`;
          const healthResponse = await fetch(this.config.indexer, {
            method: "POST",
            body: JSON.stringify({ query: blockQuery }),
            headers: { "Content-Type": "application/json" },
          });
          if (!healthResponse.ok) {
            throw new Error(`Indexer returned ${healthResponse.status}`);
          }
          const healthData = await healthResponse.json();
          this.log.log(`Wallet ${label}: indexer responding. Current block: ${healthData.data?.block?.height || "unknown"}`);
        } catch (error) {
          this.log.error(`Wallet ${label}: indexer health check failed:`, error);
          throw new Error(`Cannot join contract: Midnight indexer is not responding at ${this.config.indexer}`);
        }

        // Use privateStateId if provided, otherwise fall back to privateStateStoreName
        const privateStateId = this.config.privateStateId ??
          this.config.privateStateStoreName;
        this.log.log(`Wallet ${label}: using privateStateId: ${privateStateId}`);

        const contractJoinTimeoutSeconds = Math.round(this.contractJoinTimeoutMs / 1000);
        this.log.log(`Wallet ${label}: contract join timeout: ${contractJoinTimeoutSeconds}s`);
        this.log.log(`Wallet ${label}: starting findDeployedContract (${this.config.contractName})...`);
        const MyCompiledContract = CompiledContract.make(this.config.contractName, this.contractClass as any).pipe(
          CompiledContract.withWitnesses(this.witnesses as never),
          CompiledContract.withCompiledFileAssets('./')
        );
        const joinStartTime = Date.now();
        this.deployedContracts[walletIndex] = await Promise.race([
          (async () => {
            const result = await findDeployedContract(providers, {
              contractAddress: this.contractAddress,
              compiledContract: MyCompiledContract as any,
              privateStateId: privateStateId,
              initialPrivateState: {},
            });
            const joinDuration = Math.round((Date.now() - joinStartTime) / 1000);
            this.log.log(`Wallet ${label}: findDeployedContract completed in ${joinDuration}s`);
            return result;
          })(),
          new Promise((_, reject) =>
            setTimeout(() => {
              const elapsed = Math.round((Date.now() - joinStartTime) / 1000);
              reject(new Error(
                `Timeout: Contract join operation did not complete within ${contractJoinTimeoutSeconds} seconds ` +
                `(elapsed: ${elapsed}s). This indicates the Midnight indexer/node is not responding properly ` +
                "or there's an issue with private state synchronization even with minimal config."
              ));
            }, this.contractJoinTimeoutMs)
          )
        ]);

        this.log.log(`Wallet ${label}: contract joined successfully`);
        this.contractsJoined[walletIndex] = true;
      } catch (error) {
        this.log.error(`Wallet ${label}: failed to join contract:`, error);
        this.contractJoiningPromises[walletIndex] = null; // Reset so it can be retried
        throw error;
      }
    })();

    await this.contractJoiningPromises[walletIndex];
  }

  /**
   * Create wallet and midnight provider wrapper
   */
  private createWalletAndMidnightProvider(
    walletResult: WalletResult,
  ): WalletProvider & MidnightProvider {
    const {
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      unshieldedKeystore,
    } = walletResult;
    const log = this.log;

    const getDustBalanceFromWallet = async (): Promise<bigint> => {
      try {
        const facadeState = await Rx.firstValueFrom(
          wallet.state().pipe(Rx.timeout(5_000)),
        );
        return resolveFacadeDustBalance(facadeState);
      } catch {
        return 0n;
      }
    };

    return {
      getCoinPublicKey(): CoinPublicKey {
        return zswapSecretKeys.coinPublicKey;
      },
      getEncryptionPublicKey(): EncPublicKey {
        return zswapSecretKeys.encryptionPublicKey;
      },

      async balanceTx(
        tx: UnboundTransaction,
        ttl?: Date,
      ): Promise<FinalizedTransaction> {
        const dustBefore = await getDustBalanceFromWallet();
        const unboundTransactionRecipe = await wallet.balanceUnboundTransaction(
          tx, {
            shieldedSecretKeys: zswapSecretKeys,
            dustSecretKey: dustSecretKey,
          }, {
            ttl: ttl ?? createTtl(),
            tokenKindsToBalance: ["dust"],
          }
        );
        const signedRecipe = await wallet.signRecipe(
          unboundTransactionRecipe,
          (payload) => unshieldedKeystore.signDataAsync(payload),
        );
        const result = await wallet.finalizeRecipe(signedRecipe);
        const dustAfter = await getDustBalanceFromWallet();
        const dustCost = dustBefore - dustAfter;
        log.log(`[balanceTx] dust cost: ${formatDust(dustCost)} DUST (${formatDust(dustAfter)} DUST remaining)`);
        return result;
      },
      submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
        return wallet.submitTransaction(tx);
      },
    };
  }

  /**
   * Wait for a specific wallet to be synced and have funds
   */
  private async ensureWalletFunds(walletIndex: number): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    if (this.hasFundsPerWallet[walletIndex]) {
      // Even if we previously had funds, make sure dust is still available
      const lastBalances = this.lastFundingBalancesPerWallet[walletIndex];
      if (!lastBalances || lastBalances.dustBalance === 0n) {
        try {
          const dust = await waitForDustFunds(
            walletResult.wallet,
            { timeoutMs: this.walletFundingTimeoutMs, waitNonZero: true }
          );
          if (lastBalances) {
            lastBalances.dustBalance = dust;
          } else {
            this.lastFundingBalancesPerWallet[walletIndex] = {
              shieldedBalance: 0n,
              unshieldedBalance: 0n,
              dustBalance: dust,
            };
          }
          if (dust > 0n) {
            this.hasFundsPerWallet[walletIndex] = true;
          }
        } catch (_err) {
          // If dust still not available, keep existing state; callTx will log balances
        }
      }
      return;
    }

    this.log.log(`Wallet ${label}: waiting for dust balance...`);

    try {
      let dustBalance = 0n;
      try {
        dustBalance = await waitForDustFunds(walletResult.wallet, {
          timeoutMs: this.walletFundingTimeoutMs,
          waitNonZero: true,
        });
      } catch {
        /* no dust within timeout */
      }

      if (dustBalance === 0n) {
        this.log.log(`Wallet ${label}: no dust yet, trying unshielded→dust registration...`);
        try {
          if (await registerNightForDust(walletResult)) {
            dustBalance = await waitForDustFunds(walletResult.wallet, {
              timeoutMs: this.walletFundingTimeoutMs,
              waitNonZero: true,
            });
          }
        } catch (_err) {
          this.log.warn(`Wallet ${label}: dust registration failed`);
        }
      }

      if (dustBalance === 0n) {
        throw new Error(`Wallet ${label} has no dust for fees`);
      }

      this.lastFundingBalancesPerWallet[walletIndex] = {
        shieldedBalance: 0n,
        unshieldedBalance: 0n,
        dustBalance,
      };
      this.log.log(`Wallet ${label}: dust balance: ${dustBalance}`);
      this.hasFundsPerWallet[walletIndex] = dustBalance > 0n;
    } catch (error) {
      throw new Error(
        `Failed to ensure wallet ${label} funds: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private getInputKey(input: DefaultBatcherInput): string {
    return `${input.address}|${input.timestamp}|${input.input}`;
  }

  public buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<MidnightBatchPayload | null> | null {
    // Filter out inputs that are already being processed by another concurrent batch
    const availableInputs = inputs.filter(
      (input) => !this.inFlightInputKeys.has(this.getInputKey(input)),
    );
    if (availableInputs.length === 0) return null;

    const options = {
      maxSize: this.maxBatchSize,
    };
    const result = this.batchBuilderLogic.buildBatchData(availableInputs, options) as BatchBuildingResult<MidnightBatchPayload | null> | null;
    if (!result || !result.data) return result;

    // Mark selected inputs as in-flight and snapshot the keys
    const reservedInputKeys: string[] = [];
    for (const input of result.selectedInputs) {
      const key = this.getInputKey(input);
      this.inFlightInputKeys.add(key);
      reservedInputKeys.push(key);
    }
    result.data.reservedInputKeys = reservedInputKeys;

    return result;
  }

  /**
   * Cleanup method to properly release resources
   * Should be called when the adapter is being destroyed/shutdown
   */
  public async cleanup(): Promise<void> {
    this.log.log(`Cleaning up resources...`);

    // Close all wallets
    for (let i = 0; i < this.walletResults.length; i++) {
      const walletResult = this.walletResults[i];
      if (walletResult?.wallet) {
        try {
          await walletResult.wallet.stop();
          this.log.log(`Wallet ${i + 1}: stopped`);
        } catch (error) {
          this.log.warn(`Wallet ${i + 1}: error stopping:`, error);
        }
      }
    }

    this.log.log(`Waiting for pending operations to complete...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.log.log(`Cleanup complete`);
  }

  /**
   * Pick the next ready wallet via the worker pool's selection algorithm.
   * Returns the wallet index, or -1 if no wallet is ready.
   * The worker is marked busy in the pool.
   */
  private pickNextWallet(): { walletIdx: number; slotIdx: number } | null {
    const dustFilter = (walletIdx: number): boolean =>
      !this.walletDustExhausted[walletIdx];
    const worker = this.pool.acquireWorker(dustFilter);
    if (!worker) return null;
    // Verify the wallet is actually initialized (pool might have stale slots)
    if (!this.walletInitialized[worker.walletIdx] || !this.walletResults[worker.walletIdx]) {
      this.pool.releaseWorker(worker.walletIdx, worker.slotIdx);
      return null;
    }
    return worker;
  }

  /**
   * Run one state-changing wallet operation at a time for a wallet. A timed-out
   * SDK promise is not cancelled, so ownership of the lock transfers to that
   * promise until it actually settles. This prevents a retry from selecting
   * the same DUST input while the prior call is still active.
   */
  private async runSerializedWalletOperation<T>(
    walletIndex: number,
    operation: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    const releaseWalletLock = await this.pool.acquireBalanceLock(walletIndex);
    const operationPromise = Promise.resolve().then(operation);
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operationPromise,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            reject(new Error(timeoutMessage));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      if (timedOut) {
        void operationPromise.then(releaseWalletLock, releaseWalletLock);
      } else {
        releaseWalletLock();
      }
    }
  }

  /**
   * Submit a batch transaction to the Midnight contract.
   *
   * A worker is acquired from the pool and released in the finally block.
   * State-changing callTx lifecycles are additionally serialized per wallet
   * so no two requests can select the same DUST input.
   */
  async submitBatch(
    data: MidnightBatchPayload | null,
    fee?: string | bigint,
  ): Promise<BlockchainHash> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      this.initializationPromise = null;
    }

    if (!this.isInitialized) {
      throw new Error("Midnight adapter not initialized");
    }

    const worker = this.pickNextWallet();
    if (!worker) {
      throw new Error("No ready wallet available");
    }
    const walletIndex = worker.walletIdx;

    try {
      const walletResult = this.walletResults[walletIndex]!;
      const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

      // Ensure wallet has funds (lazy check)
      await this.ensureWalletFunds(walletIndex);

      // Join contract AFTER wallet is ready (lazy join)
      await this.ensureContractJoined(walletIndex);

      if (!this.deployedContracts[walletIndex]) {
        throw new Error(`Failed to join contract for wallet ${label}`);
      }

    try {

      if (!data || !data.payloads || data.payloads.length === 0) {
        throw new Error("Batch payload contained no invocations");
      }

      if (data.payloads.length > 1) {
        this.log.warn(
          `Received ${data.payloads.length} invocations in a single batch. ` +
            "Currently only the first invocation will be processed.",
        );
      }

      const { circuit, args } = data.payloads[0];

      // Check if circuit is pure (read-only query) or impure (state-changing transaction)
      const circuitDef = this.contractInfo.circuits.find((c) =>
        c.name === circuit
      );
      if (!circuitDef) {
        throw new Error(
          `Circuit "${circuit}" not found in contract. Available circuits: ${
            this.contractInfo.circuits.map((c) => c.name).join(", ")
          }`,
        );
      }

      this.log.log(
        `[wallet ${label}] Invoking circuit "${circuit}" with ${args.length} arguments`,
      );

      const parsedArgs = parseCircuitArgs(
        circuit,
        args,
        this.contractInfo,
      );

      this.log.log(
        `Circuit "${circuit}" is ${
          circuitDef.pure ? "PURE (query)" : "IMPURE (transaction)"
        }`,
      );
      this.log.log(`Parsed arguments:`, parsedArgs);

      let result;

      if (circuitDef.pure) {
        // Pure circuit - use call (local query, no transaction)
        this.log.log(`[wallet ${label}] Calling pure circuit (read-only query)...`);
        try {
          const callPromise = this.deployedContracts[walletIndex].call[circuit](
            ...parsedArgs,
          );
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(
                `Pure circuit call timed out after ${this.callTxTimeoutMs}ms`
              ));
            }, this.callTxTimeoutMs);
          });
          const queryResult = await Promise.race([callPromise, timeoutPromise]);
          this.log.log(`Pure circuit query succeeded! Result:`, queryResult);

          // For pure circuits, we return a fake transaction ID with the result encoded
          // Since the batcher expects a hash, we'll return a special format
          return `query:${circuit}:${JSON.stringify(queryResult)}`;
        } catch (callError) {
          this.log.error(`Pure circuit call threw an error:`);
          this.log.error(
            `  Error message:`,
            callError instanceof Error ? callError.message : String(callError),
          );
          throw callError;
        }
      } else {
        // Impure circuit - use callTx (submit transaction)
        this.log.log(`[wallet ${label}] Calling impure circuit (transaction)...`);
        this.log.log(`deployedContract type:`, typeof this.deployedContracts[walletIndex]);
        this.log.log(`callTx available?:`, !!this.deployedContracts[walletIndex]?.callTx);
        this.log.log(
          `circuit method available?:`,
          !!this.deployedContracts[walletIndex]?.callTx?.[circuit],
        );
        await this.logDustState(`callTx:${String(circuit)}`, walletIndex);
        await this.waitForDustAvailability(walletIndex);

        try {
          result = await this.runSerializedWalletOperation(
            walletIndex,
            () => this.deployedContracts[walletIndex].callTx[circuit](
              ...parsedArgs,
            ),
            this.callTxTimeoutMs,
            `callTx timed out after ${this.callTxTimeoutMs}ms — the Midnight SDK ` +
              `promise likely hung (e.g. "request body stream errored"). ` +
              `The input will be retried.`,
          );
        } catch (callTxError) {
          this.log.error(`callTx threw an error:`);
          this.log.error(`  Error type:`, typeof callTxError);
          this.log.error(
            `  Error message:`,
            callTxError instanceof Error
              ? callTxError.message
              : String(callTxError),
          );
          this.log.error(
            `  Error stack:`,
            callTxError instanceof Error ? callTxError.stack : "N/A",
          );
          const lastBalances = this.lastFundingBalancesPerWallet[walletIndex];
          if (lastBalances) {
            this.log.error(
              `  Last synced balances -> shielded: ${lastBalances.shieldedBalance.toString()}, unshielded: ${lastBalances.unshieldedBalance.toString()}, dust: ${lastBalances.dustBalance.toString()}`,
            );
          } else {
            this.log.error(`  Last synced balances: unavailable (ensureFunds did not complete)`);
          }
          throw callTxError; // Re-throw to be caught by outer catch
        }

        // Check if result has public.txHash (FinalizedTxData) or needs balancing
        if (result && result.public && result.public.txHash) {
          const txHash = result.public.txHash;
          this.log.log(`[wallet ${label}] Circuit invoked successfully! Transaction Hash: ${txHash}`);
          return txHash;
        } else {
          // Maybe it's an UnbalancedTransaction that needs balancing
          this.log.log(
            `Result doesn't have public.txHash, might need balancing:`,
            result,
          );
          throw new Error(
            "Transaction result format unexpected - may need balancing",
          );
        }
      }
    } catch (error) {
      this.log.error(`[wallet ${label}] Failed to submit batch:`, error);
      throw new Error(
        `Failed to submit batch: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    } finally {
      this.pool.releaseWorker(worker.walletIdx, worker.slotIdx);
    }
  }

  /**
   * Wait for a transaction to be confirmed on the blockchain
   */
  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60000,
  ): Promise<BlockchainTransactionReceipt> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    this.log.log(`Waiting for transaction confirmation: ${hash}`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const txInfo = await this.queryTransactionStatus(hash);

        if (txInfo && txInfo.confirmed) {
          this.log.log(
            `Transaction confirmed! Block: ${txInfo.blockNumber}, Hash: ${hash}`,
          );

          return {
            hash,
            blockNumber: txInfo.blockNumber,
            status: 1, // Success
            _midnightTxInfo: txInfo,
          };
        }
      } catch (error) {
        this.log.warn(`Failed to query transaction status: ${error}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
  }

  /**
   * Query transaction status from indexer using GraphQL API
   *
   * Note: The Midnight indexer v3 schema does not have an `applyStage` field.
   * Instead, we check if the transaction is included in a block, which indicates
   * successful execution. Transactions that fail validation are not included in blocks.
   */
  private async queryTransactionStatus(
    txId: string,
  ): Promise<{ confirmed: boolean; blockNumber: bigint } | null> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    try {
      // Normalize hash format - ensure it's lowercase and proper length
      let normalizedHash = txId.toLowerCase().replace(/^0x/, "");

      // Midnight TransactionId is 72 hex chars (288 bits), but GraphQL expects 64 (256 bits)
      // The actual transaction hash appears to be in the last 64 characters
      if (normalizedHash.length > 64) {
        normalizedHash = normalizedHash.slice(-64);
      } else if (normalizedHash.length < 64) {
        normalizedHash = normalizedHash.padStart(64, "0");
      }

      this.log.log(
        `Querying transaction: original=${txId}, normalized=${normalizedHash}`,
      );

      // Query the indexer for transaction details by hash
      // The v3 indexer schema uses `transactions(offset: { hash })` and returns
      // transaction with block info. If a transaction is included in a block,
      // it's considered confirmed (failed transactions are rejected before inclusion).
      const query = `query ($hash: String!) {
        transactions(offset: { hash: $hash }) {
          hash
          block {
            height
          }
        }
      }`;

      const response = await this.gqlQuery(query, { hash: normalizedHash });

      if (
        !response || !response.transactions ||
        response.transactions.length === 0
      ) {
        // Transaction not found yet
        return null;
      }

      const tx = response.transactions[0];

      if (!tx.block) {
        // Transaction exists but not yet included in a block
        return null;
      }

      // Transaction is confirmed if it's included in a block
      // In Midnight, transactions that fail validation are rejected before inclusion,
      // so presence in a block indicates successful execution
      return {
        confirmed: true,
        blockNumber: BigInt(tx.block.height),
      };
    } catch (error) {
      this.log.warn(`Failed to query transaction ${txId}:`, error);
      return null;
    }
  }

  /**
   * Execute a GraphQL query against the Midnight indexer
   */
  private async gqlQuery(
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    const response = await fetch(this.config.indexer, {
      method: "POST",
      body: JSON.stringify({ query, variables }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GraphQL query failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = await response.json();

    if (body.errors) {
      throw new Error(
        `GraphQL query returned errors: ${JSON.stringify(body.errors)}`,
      );
    }

    if (!body.data) {
      throw new Error("GraphQL query returned no data");
    }

    return body.data;
  }

  /**
   * Get the current account/address for this adapter
   */
  getAccountAddress(): string {
    const first = this.walletAddresses.find((a) => a !== null);
    if (!first) {
      throw new Error("Wallet not initialized");
    }
    return first;
  }

  /**
   * Get the current chain name or identifier
   */
  getChainName(): string {
    return `Midnight (${this.walletNetworkId})`;
  }

  /**
   * Estimate the fee for submitting a batch
   */
  estimateBatchFee(data: MidnightBatchPayload | null): bigint {
    // Midnight uses native token for fees
    // For now, return 0 as fees are handled by the wallet
    return 0n;
  }

  /**
   * Check if the adapter is ready to submit transactions
   */
  isReady(): boolean {
    return this.isInitialized && this.walletInitialized.some(Boolean);
  }

  // -----------------------------------------------------------------------
  // Concurrent capacity
  // -----------------------------------------------------------------------

  hasAvailableCapacity(): boolean {
    if (!this.isReady()) return false;
    return this.pool.hasAvailableWorker();
  }

  isFullyIdle(): boolean {
    return this.pool.isFullyIdle();
  }

  releaseBatchResources(batchData: MidnightBatchPayload | null): void {
    // Worker is acquired in submitBatch and released in its finally block.
    // Clear in-flight input keys so they can be picked up again if needed.
    if (batchData?.reservedInputKeys) {
      for (const key of batchData.reservedInputKeys) {
        this.inFlightInputKeys.delete(key);
      }
    }
  }

  /**
   * Get the block number of the latest confirmed block
   */
  async getBlockNumber(): Promise<bigint> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    try {
      // Query latest block from indexer using GraphQL
      const query = `query {
        block {
          height
        }
      }`;

      const response = await this.gqlQuery(query);

      if (!response || !response.block || response.block.height === undefined) {
        throw new Error("Failed to get block from indexer");
      }

      return BigInt(response.block.height);
    } catch (error) {
      throw new Error(
        `Failed to get block number: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get the sync protocol name for this adapter
   */
  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  private parseBatchPayload(
    data: string,
  ): Array<{ circuit: string; args: any[] }> {
    const decoded = this.decodeHexString(data);
    let payload: unknown;
    try {
      payload = JSON.parse(decoded);
    } catch (error) {
      throw new Error(
        `Failed to parse Midnight batch payload JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid Midnight batch payload structure");
    }

    const { prefix, payloads } = payload as {
      prefix: unknown;
      payloads: Array<{
        circuit: unknown;
        args: unknown;
        addressType?: unknown;
        address?: unknown;
        signature?: unknown;
        timestamp?: unknown;
      }>;
    };

    if (prefix !== "&B") {
      throw new Error(`Invalid batch prefix: expected "&B", got "${prefix}"`);
    }

    if (!Array.isArray(payloads)) {
      throw new Error(
        "Invalid Midnight batch payload structure: missing payloads array",
      );
    }

    const sanitized = payloads.map((entry, index) => {
      if (!entry || typeof entry.circuit !== "string") {
        throw new Error(`Invalid circuit name at index ${index}`);
      }

      if (!Array.isArray(entry.args)) {
        throw new Error(`Invalid circuit args at index ${index}`);
      }

      return { circuit: entry.circuit, args: entry.args };
    });

    return sanitized;
  }

  private decodeHexString(hex: string): string {
    const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
    try {
      return new TextDecoder().decode(hexStringToUint8Array(normalized));
    } catch (error) {
      throw new Error(
        `Failed to decode Midnight batch payload hex: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  public verifySignature(input: DefaultBatcherInput): boolean {
    // Midnight inputs are not signed in a way the core batcher understands.
    // The adapter is responsible for this logic (e.g., inside the circuit).
    // We return true to bypass this check, matching the previous hardcoded behavior.
    return true;
  }

  public validateInput(
    input: DefaultBatcherInput,
  ): ValidationResult {
    try {
      // 1. Decode the raw input
      const decodedInput = this.decodeHexIfNeeded(input.input);

      // 2. Shallow Parse (from MidnightBatchDataBuilder)
      let parsed: any;
      try {
        parsed = JSON.parse(decodedInput);
      } catch (error) {
        return {
          valid: false,
          error: "Input is not valid JSON",
        };
      }

      if (
        !parsed || typeof parsed !== "object" ||
        typeof parsed.circuit !== "string" || !Array.isArray(parsed.args)
      ) {
        return {
          valid: false,
          error:
            "Invalid input structure. Expected { circuit: string, args: [] }",
        };
      }

      // 3. Deep Parse (from submitBatch)
      const circuitDef = this.contractInfo.circuits.find((c) =>
        c.name === parsed.circuit
      );
      if (!circuitDef) {
        return {
          valid: false,
          error: `Circuit "${parsed.circuit}" not found. Available: ${
            this.contractInfo.circuits.map((c) => c.name).join(", ")
          }`,
        };
      }

      // 4. Validate arguments
      // parseCircuitArgs will throw if validation fails
      parseCircuitArgs(
        parsed.circuit,
        parsed.args,
        this.contractInfo,
      );

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error
          ? error.message
          : "Unknown validation error",
      };
    }
  }

  private decodeHexIfNeeded(value: string): string {
    if (/^0x[0-9a-fA-F]+$/.test(value)) {
      return new TextDecoder().decode(hexStringToUint8Array(value.slice(2)));
    }
    // Also handle hex without 0x prefix, if needed
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      try {
        return new TextDecoder().decode(hexStringToUint8Array(value));
      } catch {
        // Fallback to original value if not valid hex
      }
    }
    return value;
  }
}
