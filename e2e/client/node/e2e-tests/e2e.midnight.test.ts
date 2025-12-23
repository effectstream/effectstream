import { WebSocket as NodeWebSocket } from "ws";
import mqtt from "mqtt";
import { assert, assertSQL, type SharedState } from "@e2e/engine";
import type { ContractAddress } from "@midnight-ntwrk/compact-runtime";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "@e2e/midnight-contracts/counter";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/ledger";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnbalancedTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { type Resource, WalletBuilder } from "@midnight-ntwrk/wallet";
import type { Wallet } from "@midnight-ntwrk/wallet-api";
import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import { blockWatcher } from "@e2e/engine";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import type { Client } from "pg";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { dirname, resolve } from "node:path";
import type { BatcherResponse, InputUpdatePayload } from "@effectstream/batcher";
import { AddressType } from "@effectstream/utils";

const BATCHER_URL = "http://localhost:3334";
const MQTT_WS_URL = "ws://localhost:8833";
const MQTT_TIMEOUT_MS = 60_000;

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof NodeWebSocket }).WebSocket =
    NodeWebSocket;
}

// Inlined common types for standalone script
type CounterCircuits = ImpureCircuitId<any>;

const CounterPrivateStateId = "counterPrivateState";

type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof CounterPrivateStateId,
  CounterPrivateState
>;

const contractConfig = {
  privateStateStoreName: "counter-private-state",
  zkConfigPath: resolve(
    dirname(new URL(import.meta.url).pathname),
    "../../../shared/contracts/midnight/contract-counter/src/managed/counter",
  ),
};

interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  logDir = "logs/standalone";
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId("Undeployed" as unknown as any);
  }
}

/**
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const MINT_ACCOUNT = { // Account in Either format
  is_left: true,
  left: {
    bytes: "0x00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
  },
  right: {
    bytes: "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
};

// Standalone helper functions
const counterContractInstance: any = new Counter.Contract(
  witnesses,
);

const getCounterLedgerState = async (
  providers: CounterProviders,
  contractAddress: ContractAddress,
): Promise<bigint | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state = contractState != null
      ? Counter.ledger(contractState.data).round
      : null;
    console.log(`📊 Ledger state: ${state}`);
    return state;
  } catch (error) {
    console.error("❌ Error getting counter ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: CounterProviders,
  contractAddress: string,
): Promise<any> => {
  const counterContract = await findDeployedContract(providers, {
    contractAddress,
    contract: counterContractInstance,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 },
  });
  console.log(
    `Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`,
  );
  return counterContract;
};

const increment = async (
  counterContract: any,
): Promise<FinalizedTxData> => {
  console.log("Incrementing...");
  const finalizedTxData = await counterContract.callTx.increment();
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  return finalizedTxData.public;
};

const displayCounterValue = async (
  providers: CounterProviders,
  counterContract: any,
): Promise<{ counterValue: bigint | null; contractAddress: string }> => {
  const contractAddress = counterContract.deployTxData.public.contractAddress;
  const counterValue = await getCounterLedgerState(providers, contractAddress);
  if (counterValue === null) {
    console.log(`There is no counter contract deployed at ${contractAddress}.`);
  } else {
    console.log(`Current counter value: ${Number(counterValue)}`);
  }
  return { contractAddress, counterValue };
};

const createWalletAndMidnightProvider = async (
  wallet: Wallet,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
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
      Rx.filter((balance) => balance > 0n),
    ),
  );

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
  filename: string,
): Promise<Wallet & Resource> => {
  const directoryPath = Deno.env.get("SYNC_CACHE");
  let wallet: any;
  if (directoryPath !== undefined) {
    const fullPath = `${directoryPath}/${filename}`;
    try {
      const contractAddress = readMidnightContract("contract-counter", "contract-counter.json").contractAddress;
      wallet = await WalletBuilder.restore(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        contractAddress,
        "info",
      );
      wallet.start();
    } catch (error: unknown) {
      console.log(
        "Wallet was not able to restore using the stored state, building wallet from scratch",
      );
      wallet = await WalletBuilder.buildFromSeed(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        getZswapNetworkId(),
        "info",
      );
      wallet.start();
    }
  } else {
    console.log(
      "📁 File path for save file not found, building wallet from scratch",
    );

    try {
      wallet = await WalletBuilder.build(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        getZswapNetworkId(),
        "info",
      );
      console.log("✅ Wallet built successfully");
      wallet.start();
    } catch (error) {
      console.error("❌ Error building wallet:", error);
      throw error;
    }
  }

  const state: any = await Rx.firstValueFrom(wallet.state());
  console.log(`Your wallet seed is: ${seed}`);
  console.log(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  if (balance === undefined || balance === 0n) {
    console.log(`Your wallet balance is: 0`);
    console.log(`Waiting to receive tokens...`);
    balance = await waitForFunds(wallet);
  }
  console.log(`Your wallet balance is: ${balance}`);
  return wallet;
};

const configureProviders = async (
  wallet: Wallet & Resource,
  config: Config,
) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet,
  );
  return {
    privateStateProvider: levelPrivateStateProvider<
      typeof CounterPrivateStateId
    >({
      privateStateStoreName: contractConfig.privateStateStoreName,
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider<"increment">(
      contractConfig.zkConfigPath,
    ),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/**
 * Get contract address from command line arguments or from a file
 */
const getContractAddress = async (): Promise<string> => {
  // First try to get from command line arguments
  const contractAddressFromArgs = Deno.args[0];

  if (contractAddressFromArgs) {
    console.log(
      `📋 Using contract address from arguments: ${contractAddressFromArgs}`,
    );
    return contractAddressFromArgs;
  }

  // If not provided via args, try to read from contract_address.txt file

  try {
    const contractAddressFromFile = readMidnightContract("contract-counter", "contract-counter.json").contractAddress;

    if (contractAddressFromFile) {
      console.log(
        `📄 Using contract address from file: ${contractAddressFromFile}`,
      );
      return contractAddressFromFile;
    } else {
      throw new Error("Contract address file is empty");
    }
  } catch (error) {
    console.error(`❌ Error reading contract address from file: ${error}`);
    console.error("❌ Error: Contract address is required");
    console.error(
      "Usage: deno run --allow-all increment.ts <CONTRACT_ADDRESS>",
    );
    console.error(
      "Or create a contract_address.txt file with the contract address",
    );
    console.error(
      "Example: deno run --allow-all increment.ts 0x1234567890abcdef1234567890abcdef12345678",
    );
    Deno.exit(1);
  }
};


async function sendMintToBatcher(
  amount: number | string,
  confirmationLevel: string = "no-wait",
): Promise<BatcherResponse> {
  const account = MINT_ACCOUNT;
  const input = JSON.stringify({
    circuit: "mint",
    args: [account, amount],
  });
  const body = {
    data: {
      target: "midnight_eip20",
      address: "placeholderaddress",
      addressType: AddressType.MIDNIGHT,
      input,
      timestamp: Date.now(),
    },
    confirmationLevel: confirmationLevel,
  };
  const response = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json() as BatcherResponse;
  if (response.ok) {
    console.log("Mint sent to batcher successfully");
  } else {
    console.error("[ERROR] Sending mint to batcher:", result);
  }
  return result;
}

async function waitForMqttPhase(
  topic: string,
  desiredPhase: InputUpdatePayload["phase"],
  timeoutMs: number = MQTT_TIMEOUT_MS,
): Promise<InputUpdatePayload> {
  return await new Promise((resolve, reject) => {
    const client = mqtt.connect(MQTT_WS_URL, {
      protocolVersion: 4,
      reconnectPeriod: 0,
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.end(true, () =>
        reject(
          new Error(
            `[MQTT TEST] Timeout waiting for ${desiredPhase} on topic ${topic}`,
          ),
        )
      );
    }, timeoutMs);

    const finalize = (err?: Error, payload?: InputUpdatePayload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end(true, () => {
        if (err) reject(err);
        else resolve(payload!);
      });
    };

    client.on("connect", () => {
      client.subscribe(topic, (error) => {
        if (error) {
          finalize(
            new Error(
              `[MQTT TEST] Failed to subscribe to ${topic}: ${error.message}`,
            ),
          );
        }
      });
    });

    client.on("message", (incomingTopic, payload) => {
      if (incomingTopic !== topic) return;
      let parsed: InputUpdatePayload;
      try {
        parsed = JSON.parse(payload.toString());
      } catch (error) {
        finalize(
          new Error(
            `[MQTT TEST] Unable to parse payload for ${topic}: ${
              (error as Error).message
            }`,
          ),
        );
        return;
      }
      if (parsed.phase === desiredPhase) {
        finalize(undefined, parsed);
      }
    });

    client.on("error", (error) => {
      finalize(
        new Error(`[MQTT TEST] MQTT client error: ${error.message}`),
      );
    });
  });
}

/**
 * Standalone script that joins a counter contract with a specific address and increments its value.
 *
 * Usage:
 *   deno run --allow-all increment.ts <CONTRACT_ADDRESS>
 *   or create a contract_address.txt file with the contract address
 *
 * Example:
 *   deno run --allow-all increment.ts 0x1234567890abcdef1234567890abcdef12345678
 */
async function joinAndIncrementTest(
  db: Client,
  sharedState: SharedState,
): Promise<void> {
  // Get contract address from command line arguments or file
  const contractAddress = await getContractAddress();

  console.log(
    `🚀 Starting join and increment process for contract: ${contractAddress}`,
  );

  // Initialize configuration
  const config = new StandaloneConfig();

  let wallet = null;

  try {
    console.log("🔗 Building wallet with genesis seed for standalone mode...");

    // Build wallet using genesis seed (which has initial funds in standalone mode)
    wallet = await buildWalletAndWaitForFunds(
      config,
      GENESIS_MINT_WALLET_SEED,
      "contract.json",
    );

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ Configuring providers...");
    const providers = await configureProviders(wallet, config);

    console.log("✅ Providers configured successfully");

    // Join the contract
    console.log(`🔗 Joining counter contract at address: ${contractAddress}`);
    const counterContract = await joinContract(providers, contractAddress);

    console.log("✅ Successfully joined the counter contract");

    // Display current counter value before increment
    console.log("📊 Displaying current counter value before increment...");
    const beforeResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 Current counter value: ${beforeResult.counterValue}`);

    // Increment the counter
    console.log("🔢 Incrementing counter...");
    const incrementResult = await increment(counterContract);

    console.log(
      `✅ Counter incremented successfully! Transaction ID: ${incrementResult.txId}`,
    );
    console.log(
      `✅ Counter incremented! Transaction: ${incrementResult.txId} in block ${incrementResult.blockHeight}`,
    );

    sharedState.primitive_accounting_counter += 1;

    // Display counter value after increment
    console.log("📊 Displaying counter value after increment...");
    const afterResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 New counter value: ${afterResult.counterValue}`);

    console.log("🎉 Join and increment process completed successfully!");

    console.log("🔍 Waiting for block...", incrementResult.blockHeight, '@ parallelMidnight');
    await blockWatcher.waitForBlock("parallelMidnight", incrementResult.blockHeight);


  } catch (error) {
    console.error("❌ Error during join and increment process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    // Deno.exit(1);
  } finally {
    // Clean up wallet
    if (wallet) {
      try {
        console.log("🧹 Wallet closed successfully");
        await assertSQL<{
          primitive_name: string;
          id: number;
          effectstream_block_height: number;
          payload_type: string;
          payload: { 
            payload: {
              round: string;
            }
          };
        }>(
          "Midnight Rows Exists",
          db,
          "SELECT * FROM effectstream.primitive_accounting WHERE primitive_name = 'MidnightContractState'",
          (res) => true,
          (res) => {
            const countOK = res.rows.length === 2;
            const row0_OK = res.rows[0].payload.payload.round === "0";
            const row1_OK = res.rows[1].payload.payload.round === "1";
            const OK = countOK && row0_OK && row1_OK;
            if (!OK) {
              console.log({countOK, row0_OK, row1_OK, row: res.rows});
            }
            return OK;
          },
        );

        // Deno.exit(0);
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
}

async function sendMintToBatcherTest(
  db: Client,
  sharedState: SharedState,
): Promise<void> {
  const response = await sendMintToBatcher(20000) as BatcherResponse;
  console.log("🪙 Correct input for Mint sent to batcher successfully with status:", response.success);
  await assert("Send Mint to Batcher Test", async () => {
    return response.success;
  });
}

async function testMqttSubscription(
  _db: Client,
  sharedState: SharedState,
): Promise<void> {
  const { inputId } = await sendMintToBatcher(20000);
  const topic = `batcher/inputs/${inputId}`;

  await assert("MQTT mint effectstream update", async () => {
    const update = await waitForMqttPhase(topic, "effectstream-processed");
    if (update.inputId !== inputId || update.phase !== "effectstream-processed") {
      throw new Error(`MQTT mint effectstream update failed: ${JSON.stringify(update)}`);
    }
    else {
      sharedState.primitive_accounting_counter++;
      return true;
    }
  });
}

export { joinAndIncrementTest, sendMintToBatcherTest, testMqttSubscription };
