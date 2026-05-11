// Mint native unshielded M20 coins to each filler at startup, so fillers have
// M20 inventory available for M20→BTC swap fulfillment. Uses the new
// mint_unshielded circuit (FungibleToken-based mint() no longer exists).
//
// Called from the orchestrator's `mint-wallets-midnight` step after filler
// wallets have been created.

import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import {
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  buildWalletFacade,
  getInitialShieldedState,
  syncAndWaitForFunds,
  registerNightForDust,
  configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";
import {
  SimpleToken,
  witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";

globalThis.WebSocket = WebSocket;

// Static per-template domain separator for the M20 unshielded token color.
// Must match the constants in packages/filler/index.ts and
// packages/frontend/client/src/contracts/erc20.ts.
const M20_DOMAIN_SEP = new Uint8Array(32).fill(0x20);

// Genesis seed used to fund the mint operations in standalone/undeployed mode.
// Holds initial NIGHT/dust on a fresh local Midnight node.
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000001";

const currentDir = resolve(dirname(new URL(import.meta.url).pathname));

const contractConfig = {
  privateStateStoreName: "unshielded-erc20-private-state",
  zkConfigPath: resolve(
    currentDir,
    "unshielded-erc20",
    "src",
    "managed",
    "unshielded-erc20",
  ),
};

const standaloneConfig = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

const contractInstance = new SimpleToken.Contract(witnesses);

async function getContractAddress(): Promise<string> {
  const file = resolve(currentDir, "unshielded-erc20.undeployed.json");
  try {
    const json = JSON.parse(await readFile(file, "utf-8"));
    console.log(`Using contract address from ${file}: ${json.contractAddress}`);
    return json.contractAddress;
  } catch (error) {
    console.error(`Failed to read contract address from ${file}:`, error);
    throw error;
  }
}

// Decode bech32m unshielded address (mn_addr_<network>1...) to its 32-byte
// UserAddress bytes — that's what mint_unshielded expects as the recipient.
function unshieldedToUserAddressBytes(unshieldedAddr: string): Uint8Array {
  if (!unshieldedAddr.startsWith("mn_addr_")) {
    throw new Error(
      `mint-m20-to-fillers: expected mn_addr_ bech32m unshielded address, got "${unshieldedAddr}"`,
    );
  }
  const parsed = MidnightBech32m.parse(unshieldedAddr);
  return Uint8Array.prototype.slice.call(parsed.data, 0, 32);
}

export async function mintM20ToFillers(
  unshieldedAddresses: string[],
  amount: bigint,
): Promise<void> {
  setNetworkId(NetworkId.NetworkId.Undeployed);

  const contractAddress = await getContractAddress();
  console.log(`Starting M20 mint to ${unshieldedAddresses.length} filler(s)`);

  const walletResult = await buildWalletFacade(
    standaloneConfig,
    GENESIS_MINT_WALLET_SEED,
    NetworkId.NetworkId.Undeployed,
  );
  const wallet = walletResult.wallet;

  try {
    const initialState = await getInitialShieldedState(wallet.shielded);
    console.log(
      `Genesis wallet address: ${initialState.address.coinPublicKeyString()}`,
    );

    const { unshieldedBalance, dustBalance } = await syncAndWaitForFunds(
      wallet,
      { waitNonZero: true },
    );

    // Make sure dust is available to pay tx fees: register Night UTXOs if needed.
    if (dustBalance === 0n && unshieldedBalance > 0n) {
      try {
        await registerNightForDust(walletResult);
      } catch (e) {
        console.warn(
          `registerNightForDust failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const providers = (await configureMidnightNodeProviders(
      walletResult.wallet,
      walletResult.zswapSecretKeys,
      walletResult.walletZswapSecretKeys,
      walletResult.dustSecretKey,
      walletResult.walletDustSecretKey,
      standaloneConfig,
      contractConfig.privateStateStoreName,
      contractConfig.zkConfigPath,
      walletResult.unshieldedKeystore,
    )) as any;

    const deployed = await findDeployedContract(providers, {
      contractAddress,
      contract: contractInstance as any,
      privateStateId: "simpleTokenPrivateState",
      initialPrivateState: {},
    });
    console.log(
      `Joined contract at ${deployed.deployTxData.public.contractAddress}`,
    );

    let i = 1;
    for (const addr of unshieldedAddresses) {
      console.log(
        `[${i}/${unshieldedAddresses.length}] minting ${amount} M20 to ${addr}`,
      );
      const recipientBytes = unshieldedToUserAddressBytes(addr);
      // Pass Uint8Array directly — Array.from() would produce a plain JS array
      // which the Compact runtime rejects as Bytes<32>.
      const finalized = await (deployed.callTx as any).mint_unshielded(
        M20_DOMAIN_SEP,
        amount,
        { bytes: recipientBytes },
      );
      console.log(
        `  ✅ tx ${finalized.public.txId} block ${finalized.public.blockHeight}`,
      );
      i += 1;
    }
    console.log("🎉 M20 pre-mint to fillers complete");
  } finally {
    await wallet.stop();
  }
}
