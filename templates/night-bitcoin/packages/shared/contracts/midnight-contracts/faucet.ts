import { NetworkId } from "@midnight-ntwrk/compact-runtime";
import { nativeToken } from "@midnight-ntwrk/ledger";
import { type Resource, WalletBuilder } from "@midnight-ntwrk/wallet";
import { type Wallet } from "@midnight-ntwrk/wallet-api";
import * as Rx from "rxjs";
import { setNetworkId } from "npm:@midnight-ntwrk/midnight-js-network-id";

/**
 * This script transfers 10.0 dust from the default midnight wallet to a given address.
 * This works only on the local undeployed network.
 *
 * This is useful to pass dust to Lace wallets in the browser for testing purposes.
 *
 * Usage:
 * MIDNIGHT_ADDRESS=mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts
 *
 */

globalThis.WebSocket = WebSocket;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId("Undeployed" as any);
  }
}

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state: any) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        console.log(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`
        );
      }),
      Rx.filter((state: any) => {
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s: any) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance: bigint) => balance > 0n)
    )
  );

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string
): Promise<Wallet & Resource> => {
  const wallet = await WalletBuilder.build(
    indexer,
    indexerWS,
    proofServer,
    node,
    seed,
    NetworkId.Undeployed
  );
  console.log("✅ Wallet built successfully");
  wallet.start();
  const state = await Rx.firstValueFrom(wallet.state());
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

const transfer = async (wallet: Wallet & Resource, receiverAddress: string, amount: bigint = 10000000n): Promise<void> => {
  console.log(`Transferring ${amount} to ${receiverAddress}`);
  const transferRecipe = await wallet.transferTransaction([
    {
      amount, // 10 Dust
      type: nativeToken(), // "tDUST",
      receiverAddress,
    },
  ]);
  console.log({ transferRecipe });
  const provenTransaction = await wallet.proveTransaction(transferRecipe);
  console.log({ provenTransaction });

  const submittedTransaction = await wallet.submitTransaction(
    provenTransaction
  );
  console.log({ submittedTransaction });
}


export const faucet = async (receiverAddresses: string | string[], seed: string = GENESIS_MINT_WALLET_SEED): Promise<void> => {
  let wallet: (Wallet & Resource) | null = null;
  
  try {
    // Initialize configuration
    const config = new StandaloneConfig();

    console.log("🔗 Building wallet with genesis seed for standalone mode...");

    // Build wallet using genesis seed (which has initial funds in standalone mode)
    wallet = await buildWalletAndWaitForFunds(config, seed);
    console.log("✅ Wallet built successfully");

    let i = 1;
    if (Array.isArray(receiverAddresses)) {
      for (const receiverAddress of receiverAddresses) {
        await transfer(wallet, receiverAddress, 10000000n + BigInt(i));
        i++;
      }
    } else {
      await transfer(wallet, receiverAddresses, 10000000n);
    }

    console.log("✅ Successfully transferred dust to receiver address ");
  } catch (error) {
    console.error("❌ Error during join and mint process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
  } finally {
    // Clean up wallet
    if (wallet) {
      try {
        wallet.close();
        console.log("🧹 Wallet closed successfully");
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
};

// Run the script if this file is executed directly
if (import.meta.main) {
  const midnightAddress = Deno.env.get("MIDNIGHT_ADDRESS");
  if (!midnightAddress) {
    console.error("❌ MIDNIGHT_ADDRESS environment variable is not set");
    console.error(
      "Example: MIDNIGHT_ADDRESS=mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts"
    );
    Deno.exit(1);
  }
  try {
    await faucet(midnightAddress);
    Deno.exit(0);
  } catch (error) {
    console.error("❌ Error during faucet process:", error);
    Deno.exit(1);
  }
}
