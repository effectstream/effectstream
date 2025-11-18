import {
    erc7683,
    witnesses as erc7683Witnesses,
} from "@night-bitcoin/midnight-contract-erc7683"

console.log(erc7683, erc7683Witnesses);

import {
    type ContractAddress,
    NetworkId,
  } from "@midnight-ntwrk/compact-runtime";

  import {
    type CoinInfo,
    nativeToken,
    Transaction,
    type TransactionId,
  } from "@midnight-ntwrk/ledger";
  import {
    type DeployedContract,
    findDeployedContract,
    type FoundContract,
  } from "@midnight-ntwrk/midnight-js-contracts";
  import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
  import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
  import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
  
  import {
    type BalancedTransaction,
    Contract,
    createBalancedTx,
    type FinalizedTxData,
    type ImpureCircuitId,
    type MidnightProvider,
    type MidnightProviders,
    type UnbalancedTransaction,
    type WalletProvider,
  } from "@midnight-ntwrk/midnight-js-types";
  import { type Resource, WalletBuilder } from "@midnight-ntwrk/wallet";
  import type { Wallet } from "@midnight-ntwrk/wallet-api";
  import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
  import * as Rx from "rxjs";
  import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
  import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
  import {
    getLedgerNetworkId,
    getZswapNetworkId,
    setNetworkId,
  } from "@midnight-ntwrk/midnight-js-network-id";
  import { dirname, resolve } from "node:path";
  import {
    MidnightBech32m,
    ShieldedAddress,
  } from "@midnight-ntwrk/wallet-sdk-address-format";
  import {
    type DAppConnectorAPI,
    type DAppConnectorWalletAPI,
    type ServiceUriConfig,
  } from '@midnight-ntwrk/dapp-connector-api';
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
  } from 'rxjs';
  import { pipe as fnPipe } from 'fp-ts/function';
  import semver from 'semver';
 
  const BASE_URL_MIDNIGHT_NODE_A = `http://127.0.0.1:9944`;
  const getMidnightNodeUrl = async (): Promise<string> => {
    return BASE_URL_MIDNIGHT_NODE_A;
  };
  
  const BASE_URL_MIDNIGHT_INDEXER = `http://127.0.0.1:8088`;
  const BASE_WS_MIDNIGHT_INDEXER = `ws://127.0.0.1:8088`;
  const BASE_URL_PROOF_SERVER = `http://127.0.0.1:6300`;
  const BASE_URL_MIDNIGHT_INDEXER_API = `${BASE_URL_MIDNIGHT_INDEXER}/api/v1/graphql`;
  const BASE_URL_MIDNIGHT_INDEXER_WS = `${BASE_WS_MIDNIGHT_INDEXER}/api/v1/graphql/ws`;
  
  
  
  type PrivateState = {};
  const erc7683PrivateStateId = "erc7683PrivateState";
  
  
  export type Erc7683ChainContract = Contract<PrivateState, typeof erc7683Witnesses>;
  
  
  // Inlined common types for standalone script
  type Erc7683Circuits = ImpureCircuitId<Erc7683Contract>;
  
  export type Erc7683Providers = MidnightProviders<
    Erc7683Circuits,
    undefined,
    undefined
  >;
  
  type Erc7683Contract = erc7683.Contract;
  
  type DeployedErc7683Contract =
    | DeployedContract<Erc7683Contract>
    | FoundContract<Erc7683Contract>;
  
  
  // Inlined config for standalone script
  const currentDir = resolve(
    dirname(new URL(import.meta.url).pathname),
  );
  
  // const contractConfig = {
  //   privateStateStoreName: "multichain_multitoken-private-state",
  //   zkConfigPath: resolve(
  //     currentDir,
  //     "contract-eip-1155",
  //     "src",
  //     "managed",
  //     "multichain_multitoken",
  //   ),
  // };
  
  interface Config {
    readonly logDir: string;
    readonly indexer: string;
    readonly indexerWS: string;
    readonly node: string;
    readonly proofServer: string;
  }
  
  class StandaloneConfig implements Config {
    logDir = resolve(
      currentDir,
      "..",
      "logs",
      "standalone",
      `${new Date().toISOString()}.log`,
    );
    indexer = BASE_URL_MIDNIGHT_INDEXER_API;
    indexerWS = BASE_URL_MIDNIGHT_INDEXER_WS;
    node: string;
    proofServer = BASE_URL_PROOF_SERVER;
    constructor(nodeUrl: string) {
      this.node = nodeUrl;
      setNetworkId("Undeployed" as any);
    }
  }
  
  /**
   * This seed gives access to tokens minted in the genesis block of a local development node - only
   * used in standalone networks to build a wallet with initial funds.
   */
  const GENESIS_MINT_WALLET_SEED =
    "0000000000000000000000000000000000000000000000000000000000000001";
  
  const erc7683ContractInstance = new erc7683
    .Contract(
    erc7683Witnesses,
  );
  
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
      const state = contractState != null
        ? erc7683.ledger(contractState.data)
        : null;
      console.log(`📊 Ledger state:`,state);
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
    const erc7683Contract = await findDeployedContract(providers, {
      contractAddress,
      contract: erc7683ContractInstance,
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
        user?: string,
        orderId?: string,
        originChainId?: bigint,
        openDeadline?: bigint,
        fillDeadline?: bigint,
        maxSpent_token?: string,
        maxSpent_amount?: bigint,
        maxSpent_recipient?: string,
        maxSpent_chainId?: bigint,
        minReceived_token?: string,
        minReceived_amount?: bigint,
        minReceived_recipient?: string,
        minReceived_chainId?: bigint,
        destinationChainId?: bigint,
        destinationSettler?: string,
        originData?: Object,
    } = {}
  ): Promise<FinalizedTxData & typeof config> => {
    console.log("Creating intent...");
    const shieldedAddress = ShieldedAddress.codec.decode(
      "undeployed",
      MidnightBech32m.parse(account),
    );
    console.log("shieldedAddress", shieldedAddress.coinPublicKeyString());
    const either = {
      is_left: true,
      left: { bytes: shieldedAddress.coinPublicKey.data },
      right: { bytes: new Uint8Array(32) },
    };

    const toEncodedString = (str: string, length: number): Uint8Array => {
      const buffer = new Uint8Array(length);
      const encoded = new TextEncoder().encode(str);
      buffer.set(encoded.slice(0, length));
      return buffer;
    };

    console.log("erc7683Contract.callTx.initialize", config);
    const finalizedTxData = await (erc7683Contract.callTx as any).initialize(
      toEncodedString(config.user || '', 128),
      toEncodedString(config.orderId || '', 32),
      config.originChainId || 0n,
      config.openDeadline || 0n,
      config.fillDeadline || 0n,
      toEncodedString(config.maxSpent_token || '', 32),
      config.maxSpent_amount || 0n,
      toEncodedString(config.maxSpent_recipient || '', 32),
      config.maxSpent_chainId || 0n,
      toEncodedString(config.minReceived_token || '', 32),
      config.minReceived_amount || 0n,
      toEncodedString(config.minReceived_recipient || '', 32),
      config.minReceived_chainId || 0n,
      config.destinationChainId || 0n,
      toEncodedString(config.destinationSettler || '', 32),
      toEncodedString(JSON.stringify(config.originData || {}), 256),
    );
        // either, 
        // value);
    console.log(
      `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
    );
    console.log(`Created intent ${config.orderId} for ${account}`);
    return { ...finalizedTxData.public, ...config };
  };
  
  const balanceOf = async (
    erc7683Contract: any, // DeployedErc7683Contract,
    account: string,
  ): Promise<bigint> => {
    return await balanceOfQuery(account);
    /*const shieldedAddress = ShieldedAddress.codec.decode(
      "undeployed",
      MidnightBech32m.parse(account),
    );
    const either = {
      is_left: true,
      left: { bytes: shieldedAddress.coinPublicKey.data },
      right: { bytes: new Uint8Array(32) },
    };
    const balance = await (simpleTokenContract.callTx as any).balanceOf(either);
    console.log('balanceOf', balance);
    return balance.private.result as bigint;*/
  };
  
  const transferToEvm = async (
    simpleTokenContract: any, // DeployedSimpleTokenContract,
    account: string,
    targetAddress: string,
    amount: bigint,
    txHash: string,
  ): Promise<FinalizedTxData> => {
    const shieldedAddress = ShieldedAddress.codec.decode(
      "undeployed",
      MidnightBech32m.parse(account),
    );
    const either = {
      is_left: true,
      left: { bytes: shieldedAddress.coinPublicKey.data },
      right: { bytes: new Uint8Array(32) },
    };
    const finalizedTxData = await (simpleTokenContract.callTx as any).transferToEvm(targetAddress, amount, txHash);
    console.log(
      `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
    );
    console.log(finalizedTxData);
    console.log(`Transferred ${amount} tokens to ${targetAddress}`);
    return finalizedTxData.public;
  };
  
  // const increment = async (
  //   counterContract: DeployedCounterContract,
  //   contractAddress: string,
  //   tokenId: string,
  //   propertyName: string,
  //   propertyValue: string,
  // ): Promise<FinalizedTxData> => {
  //   console.log("Incrementing...");
  
  //   console.log(`📝 Using parameters:`);
  //   console.log(`   Contract Address: ${contractAddress}`);
  //   console.log(`   Token ID: ${tokenId}`);
  //   console.log(`   Property Name: ${propertyName}`);
  //   console.log(`   Property Value: ${propertyValue}`);
  
  //   const toEncodedString = (str: string, length = 32) =>
  //     Uint8Array.from(
  //       str.padEnd(length, " ").split("").map((c) => c.charCodeAt(0)),
  //     );
  //   const finalizedTxData = await counterContract.callTx.increment(
  //     toEncodedString(contractAddress, 64),
  //     toEncodedString(tokenId, 64),
  //     toEncodedString(propertyName, 32),
  //     toEncodedString(propertyValue, 32),
  //   );
  //   console.log(
  //     `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  //   );
  //   return finalizedTxData.public;
  // };
  
  const displayErc7683Value = async (
    providers: Erc7683Providers,
    erc7683Contract: DeployedErc7683Contract,
  ): Promise<{ state: any | null; contractAddress: string }> => {
    const contractAddress = erc7683Contract.deployTxData.public.contractAddress;
    const state = await getErc7683LedgerState(providers, contractAddress);
    return { contractAddress, state };
  };
  
  const createWalletAndErc7683Provider = async (
    wallet: Wallet,
  ): Promise<WalletProvider & MidnightProvider> => {
    const state = await wallet.state();
    console.log({state});
  
    const object =  {
      coinPublicKey: state.coinPublicKey,
      encryptionPublicKey: state.encryptionPublicKey,
      balanceTx(
        tx: UnbalancedTransaction,
        newCoins: CoinInfo[],
      ): Promise<BalancedTransaction> {
        return wallet
          .balanceTransaction(
            ZswapTransaction.deserialize(
              tx.serialize(getLedgerNetworkId()),
              getZswapNetworkId(),
            ),
            newCoins,
          )
          .then((tx) => wallet.proveTransaction(tx))
          .then((zswapTx) =>
            Transaction.deserialize(
              zswapTx.serialize(getZswapNetworkId()),
              getLedgerNetworkId(),
            )
          )
          .then(createBalancedTx);
      },
      submitTx(tx: BalancedTransaction): Promise<TransactionId> {
        return wallet.submitTransaction(tx);
      },
    };
    console.log({object});
    return object;
  };
  
  const waitForFunds = (wallet: Wallet) =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(10_000),
        Rx.tap((state: any) => {
          const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
          const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
          console.log(
            `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
          );
        }),
        Rx.filter((state: any) => {
          return state.syncProgress?.synced === true;
        }),
        Rx.map((s: any) => s.balances[nativeToken()] ?? 0n),
        Rx.filter((balance: bigint) => balance > 0n),
      ),
    );
  
  const oldCreateWalletAndMidnightProvider = async (
    wallet: Wallet,
  ): Promise<WalletProvider & MidnightProvider> => {
    const state = await Rx.firstValueFrom(wallet.state());
    console.log({ oldState: state });
    const balance = await waitForFunds(wallet);
    console.log({ balance });
    console.log({ oldState: state });
  
    return {
      coinPublicKey: state.coinPublicKey,
      encryptionPublicKey: state.encryptionPublicKey,
      balanceTx(
        tx: UnbalancedTransaction,
        newCoins: CoinInfo[],
      ): Promise<BalancedTransaction> {
        return wallet
          .balanceTransaction(
            ZswapTransaction.deserialize(
              tx.serialize(getLedgerNetworkId()),
              getZswapNetworkId(),
            ),
            newCoins,
          )
          .then((tx) => wallet.proveTransaction(tx))
          .then((zswapTx) =>
            Transaction.deserialize(
              zswapTx.serialize(getZswapNetworkId()),
              getLedgerNetworkId(),
            )
          )
          .then(createBalancedTx);
      },
      submitTx(tx: BalancedTransaction): Promise<TransactionId> {
        return wallet.submitTransaction(tx);
      },
    };
  };
  
  const buildWalletAndWaitForFunds = async (
    { indexer, indexerWS, node, proofServer }: Config,
    seed: string,
    filename: string,
  ): Promise<Wallet & Resource> => {
    const wallet = await WalletBuilder.buildFromSeed(
      indexer,
      indexerWS,
      proofServer,
      node,
      seed,
      NetworkId.Undeployed,
      "info",
    );
    console.log("✅ Wallet built successfully");
    wallet.start();
  
    // Wait for wallet to be initialized with a timeout
    console.log("🔄 Waiting for wallet to initialize...");
    const state = await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.timeout(30000), // 30 second timeout
        Rx.tap((state: any) => {
          console.log("🔗 [WALLET] Wallet state received:", {
            address: state.address,
            synced: state.syncProgress?.synced,
            balanceCount: Object.keys(state.balances || {}).length,
          });
        }),
      ),
    );
  
    console.log(`✅ Wallet initialized with address: ${state.address}`);
    return wallet as any;
  };
  





  class MidnightAlternativeLogin {
    private initializedProviders: Promise<MultiChainMultiTokenProviders> | undefined;
    private logger = {
      info: (...message: any[]) => console.log(...message),
      error: (...message: any[]) => console.error(...message),
    };
  
    constructor() {
    }
  
  public getProviders(): Promise<MultiChainMultiTokenProviders> {
    // We use a cached `Promise` to hold the providers. This will:
    //
    // 1. Cache and re-use the providers (including the configured connector API), and
    // 2. Act as a synchronization point if multiple contract deploys or joins run concurrently.
    //    Concurrent calls to `getProviders()` will receive, and ultimately await, the same
    //    `Promise`.
    return this.initializedProviders ?? (this.initializedProviders = this.initializeProviders());
  }
  
  
  /** @internal */
  private async initializeProviders(): Promise<MultiChainMultiTokenProviders> {
  const { wallet, uris } = await this.connectToWallet();
  const walletState = await wallet.state();
  const zkConfigPath = window.location.origin; // '../../../contract/src/managed/bboard';
  
  console.log(`Connecting to wallet with network ID: ${getLedgerNetworkId()}`);
  
  return {
    privateStateProvider: levelPrivateStateProvider({}),
    zkConfigProvider: new FetchZkConfigProvider(zkConfigPath, fetch.bind(window)),
    proofProvider: httpClientProofProvider(uris.proverServerUri),
    publicDataProvider: indexerPublicDataProvider(uris.indexerUri, uris.indexerWsUri),
    walletProvider: {
      coinPublicKey: walletState.coinPublicKey,
      encryptionPublicKey: walletState.encryptionPublicKey,
      balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
        return wallet
          .balanceAndProveTransaction(
            ZswapTransaction.deserialize(tx.serialize(getLedgerNetworkId()), getZswapNetworkId()),
            newCoins,
          )
          .then((zswapTx: any) => Transaction.deserialize(zswapTx.serialize(getZswapNetworkId()), getLedgerNetworkId()))
          .then(createBalancedTx);
      },
    },
    midnightProvider: {
      submitTx(tx: BalancedTransaction): Promise<TransactionId> {
        return wallet.submitTransaction(tx);
      },
    },
  };
  };
  
  /** @internal */
  private async connectToWallet(): Promise<{ wallet: DAppConnectorWalletAPI; uris: ServiceUriConfig }> {
  const COMPATIBLE_CONNECTOR_API_VERSION = '1.x';
  
  return firstValueFrom(
    fnPipe(
      interval(100),
      map(() => window.midnight?.mnLace),
      tap((connectorAPI) => {
        this.logger.info(connectorAPI, 'Check for wallet connector API');
      }),
      filter((connectorAPI): connectorAPI is DAppConnectorAPI => !!connectorAPI),
      concatMap((connectorAPI) =>
        semver.satisfies(connectorAPI.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)
          ? of(connectorAPI)
          : throwError(() => {
              this.logger.error(
                {
                  expected: COMPATIBLE_CONNECTOR_API_VERSION,
                  actual: connectorAPI.apiVersion,
                },
                'Incompatible version of wallet connector API',
              );
  
              return new Error(
                `Incompatible version of Midnight Lace wallet found. Require '${COMPATIBLE_CONNECTOR_API_VERSION}', got '${connectorAPI.apiVersion}'.`,
              );
            }),
      ),
      tap((connectorAPI) => {
        this.logger.info(connectorAPI, 'Compatible wallet connector API found. Connecting.');
      }),
      take(1),
      timeout({
        first: 1_000,
        with: () =>
          throwError(() => {
            this.logger.error('Could not find wallet connector API');
  
            return new Error('Could not find Midnight Lace wallet. Extension installed?');
          }),
      }),
      concatMap(async (connectorAPI) => {
        const isEnabled = await connectorAPI.isEnabled();
  
        this.logger.info(isEnabled, 'Wallet connector API enabled status');
  
        return connectorAPI;
      }),
      timeout({
        first: 5_000,
        with: () =>
          throwError(() => {
            this.logger.error('Wallet connector API has failed to respond');
  
            return new Error('Midnight Lace wallet has failed to respond. Extension enabled?');
          }),
      }),
      concatMap(async (connectorAPI) => ({ 
        walletConnectorAPI: await connectorAPI.enable(),
        connectorAPI 
      })),
      catchError((error, apis) =>
        error
          ? throwError(() => {
              this.logger.error('Unable to enable connector API');
              return new Error('Application is not authorized');
            })
          : apis,
      ),
      concatMap(async ({ walletConnectorAPI, connectorAPI }) => {
        const uris = await connectorAPI.serviceUriConfig();
  
        this.logger.info('Connected to wallet connector API and retrieved service configuration');
  
        return { wallet: walletConnectorAPI, uris };
      }),
    ),
  );
  };
  
  }
  


  


  
  const configureProviders = async (
    injectedWallet: Wallet & Resource,
    config: Config,
  ) => {
  
    // const internalWalletAndMidnightProvider = await oldCreateWalletAndMidnightProvider(
    //   internalWallet,
    // );
  
    const injectedWalletAndErc7683Provider = await createWalletAndErc7683Provider(
      injectedWallet,
    );
  
    // console.log({ internalWalletAndMidnightProvider, injectedWalletAndMidnightProvider });
  
    // const privateStateProvider = levelPrivateStateProvider<
    //   typeof MultiChainMultiTokenPrivateStateId
    // >({
    //   privateStateStoreName: contractConfig.privateStateStoreName,
    // });
  
    // const publicDataProvider = indexerPublicDataProvider(
    //   config.indexer,
    //   config.indexerWS,
    // );
  
    // const zkConfigPath = window.location.origin;
  
    // const zkConfigProvider = new FetchZkConfigProvider(
    //   zkConfigPath,
    //   fetch.bind(window),
    // );
    // const proofProvider = httpClientProofProvider(config.proofServer);
  
    const providers = await new MidnightAlternativeLogin().getProviders();
  
    // const providers: MultiChainMultiTokenProviders = {
    //   privateStateProvider,
    //   publicDataProvider,
    //   zkConfigProvider,
    //   proofProvider,
    //   walletProvider: internalWalletAndMidnightProvider,
    //   midnightProvider: internalWalletAndMidnightProvider,
    //   injectedWalletProvider: injectedWalletAndMidnightProvider,
    //   injectedMidnightProvider: injectedWalletAndMidnightProvider,
    // };
    return {
      ...providers,
      injectedWalletProvider: injectedWalletAndErc7683Provider,
  }
  };
  
  /**
   * Get contract address from command line arguments or from a file
   */
  const getContractAddress = async (): Promise<string> => {
    const r = await fetch("contract_address/contract-erc7683.json");
    const json = await r.json();
    console.log("🔍 Contract address:", json.contractAddress);
    return json.contractAddress;
  };
  
  
    
  class Erc7683AlternativeLogin {
    private initializedProviders: Promise<Erc7683Providers> | undefined;
    private logger = {
      info: (...message: any[]) => console.log(...message),
      error: (...message: any[]) => console.error(...message),
    };
  
    constructor() {
    }
  
  public getProviders(): Promise<Erc7683Providers> {
    // We use a cached `Promise` to hold the providers. This will:
    //
    // 1. Cache and re-use the providers (including the configured connector API), and
    // 2. Act as a synchronization point if multiple contract deploys or joins run concurrently.
    //    Concurrent calls to `getProviders()` will receive, and ultimately await, the same
    //    `Promise`.
    return this.initializedProviders ?? (this.initializedProviders = this.initializeProviders());
  }
  
  
  /** @internal */
  private async initializeProviders(): Promise<Erc7683Providers> {
  const { wallet, uris } = await this.connectToWallet();
  const walletState = await wallet.state();
  const zkConfigPath = window.location.origin; // '../../../contract/src/managed/bboard';
  
  console.log(`Connecting to wallet with network ID: ${getLedgerNetworkId()}`);
  
  return {
    privateStateProvider: levelPrivateStateProvider({}),
    zkConfigProvider: new FetchZkConfigProvider(zkConfigPath, fetch.bind(window)),
    proofProvider: httpClientProofProvider(uris.proverServerUri),
    publicDataProvider: indexerPublicDataProvider(uris.indexerUri, uris.indexerWsUri),
    walletProvider: {
      coinPublicKey: walletState.coinPublicKey,
      encryptionPublicKey: walletState.encryptionPublicKey,
      balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
        return wallet
          .balanceAndProveTransaction(
            ZswapTransaction.deserialize(tx.serialize(getLedgerNetworkId()), getZswapNetworkId()),
            newCoins,
          )
          .then((zswapTx: any) => Transaction.deserialize(zswapTx.serialize(getZswapNetworkId()), getLedgerNetworkId()))
          .then(createBalancedTx);
      },
    },
    midnightProvider: {
      submitTx(tx: BalancedTransaction): Promise<TransactionId> {
        return wallet.submitTransaction(tx);
      },
    },
  };
  };
  
  /** @internal */
  private async connectToWallet(): Promise<{ wallet: DAppConnectorWalletAPI; uris: ServiceUriConfig }> {
  const COMPATIBLE_CONNECTOR_API_VERSION = '1.x';
  
  return firstValueFrom(
    fnPipe(
      interval(100),
      map(() => window.midnight?.mnLace),
      tap((connectorAPI) => {
        this.logger.info(connectorAPI, 'Check for wallet connector API');
      }),
      filter((connectorAPI): connectorAPI is DAppConnectorAPI => !!connectorAPI),
      concatMap((connectorAPI) =>
        semver.satisfies(connectorAPI.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)
          ? of(connectorAPI)
          : throwError(() => {
              this.logger.error(
                {
                  expected: COMPATIBLE_CONNECTOR_API_VERSION,
                  actual: connectorAPI.apiVersion,
                },
                'Incompatible version of wallet connector API',
              );
  
              return new Error(
                `Incompatible version of Midnight Lace wallet found. Require '${COMPATIBLE_CONNECTOR_API_VERSION}', got '${connectorAPI.apiVersion}'.`,
              );
            }),
      ),
      tap((connectorAPI) => {
        this.logger.info(connectorAPI, 'Compatible wallet connector API found. Connecting.');
      }),
      take(1),
      timeout({
        first: 1_000,
        with: () =>
          throwError(() => {
            this.logger.error('Could not find wallet connector API');
  
            return new Error('Could not find Midnight Lace wallet. Extension installed?');
          }),
      }),
      concatMap(async (connectorAPI) => {
        const isEnabled = await connectorAPI.isEnabled();
  
        this.logger.info(isEnabled, 'Wallet connector API enabled status');
  
        return connectorAPI;
      }),
      timeout({
        first: 5_000,
        with: () =>
          throwError(() => {
            this.logger.error('Wallet connector API has failed to respond');
  
            return new Error('Midnight Lace wallet has failed to respond. Extension enabled?');
          }),
      }),
      concatMap(async (connectorAPI) => ({ 
        walletConnectorAPI: await connectorAPI.enable(),
        connectorAPI 
      })),
      catchError((error, apis) =>
        error
          ? throwError(() => {
              this.logger.error('Unable to enable connector API');
              return new Error('Application is not authorized');
            })
          : apis,
      ),
      concatMap(async ({ walletConnectorAPI, connectorAPI }) => {
        const uris = await connectorAPI.serviceUriConfig();
  
        this.logger.info('Connected to wallet connector API and retrieved service configuration');
  
        return { wallet: walletConnectorAPI, uris };
      }),
    ),
  );
  };
  
  }
  
  
  const connectMidnightWallet = async (injectedWallet: any): Promise<{
    injectedWallet: Wallet & Resource;
    providers: Erc7683Providers;
  }> => {
    console.log("🔗 Building Midnight wallet with genesis seed...");
  
    const midnightNodeUrl = await getMidnightNodeUrl();
    const config = new StandaloneConfig(midnightNodeUrl);
    // const internalWallet = await buildWalletAndWaitForFunds(
    //   config,
    //   GENESIS_MINT_WALLET_SEED,
    //   "contract.json",
    // );
  
    // console.log("✅ Midnight wallet built successfully");
  
    const providers = await configureProviders(injectedWallet, config);
    console.log("✅ Providers configured successfully");
  
    return { injectedWallet, providers };
  };
  
  const connectToContract = async (
    providers: Erc7683Providers,
    contractAddress?: string,
  ): Promise<{
    contract: DeployedErc7683Contract;
    state: any | null;
    contractAddress: string;
  }> => {
    const address = contractAddress || await getContractAddress();
    console.log(`🔗 Joining multi chain multi token contract at address: ${address}`);
  
    const contract = await joinContract(providers, address);
    console.log("✅ Successfully joined the multi chain multi token contract");
  
    // Get initial state
    const currentState = await displayErc7683Value(providers, contract);
    console.log(`📊 Current state value:`, currentState);
    
  
    return { contract, state: currentState.state, contractAddress: currentState.contractAddress };
  };
  
  const fetchCurrentCounterState = async (
    providers: Erc7683Providers,
    erc7683Contract?: DeployedErc7683Contract,
  ): Promise<{ state: any | null; contractAddress: string }> => {
    const actualProviders = providers;
    const actualContract = erc7683Contract;
  
    if (!actualProviders || !actualContract) {
      throw new Error("Providers and contract must be initialized first");
    }
  
    return await displaySimpleTokenValue(actualProviders, actualContract);
  };
  
  export {
    createIntent,
    // mint,
    // balanceOf,
    connectMidnightWallet,
    connectToContract,
    // fetchCurrentCounterState,
    // transferToEvm,
  };
  