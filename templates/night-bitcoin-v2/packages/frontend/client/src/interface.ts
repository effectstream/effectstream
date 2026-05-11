import { walletLogin, WalletMode } from "@effectstream/wallets";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

import * as unshielded_erc20 from "./contracts/erc20.ts";
import * as erc7683 from "./contracts/intents.ts";
import { extractPublicCoinAddress } from "./contracts/midnight-utils.ts";
import { balanceOf as balanceOfFromLedger } from "./contracts/balanceOf.ts";

enum AddressType {
  MIDNIGHT = 5,
}

const BATCHER_URL =
  import.meta.env.VITE_BATCHER_URL || "http://127.0.0.1:3334";

const MIDNIGHT_NETWORK_ID =
  import.meta.env.VITE_MIDNIGHT_NETWORK_ID || "undeployed";

async function submitToBatcher(
  serializedTx: string,
  circuitId: string,
  addr: string,
) {
  console.log(`🚀 Sending ${circuitId} transaction to Batcher...`);

  const body = {
    data: {
      target: "midnight_balancing",
      address: addr,
      addressType: AddressType.MIDNIGHT,
      input: JSON.stringify({
        tx: serializedTx,
        circuitId: circuitId,
      }),
      timestamp: Date.now(),
    },
    confirmationLevel: "no-wait",
  };

  const response = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(`Batcher failed: ${result.message || response.statusText}`);
  }

  console.log("📬 Batcher accepted transaction:", result);
  return result;
}

export async function loginMidnight() {
  const result = await walletLogin({
    mode: WalletMode.Midnight,
    networkId: MIDNIGHT_NETWORK_ID as any,
  });

  if (!result.success) {
    console.log("loginMidnight: walletLogin failed", result);
    throw new Error("Cannot login");
  }
  const paimaWallet = result.result;

  const response = {
    addr: "",
    unshieldedAddr: "",
    contract: {
      unshielded_erc20: null,
      erc7683: null,
    },
    contractAddress: {
      unshielded_erc20: "",
      erc7683: "",
    },
    stateA: {
      unshielded_erc20: null,
      erc7683: null,
    },
    stateB: {
      unshielded_erc20: null,
      erc7683: null,
    },
    wallet: null,
  } as any;

  {
    const connectedApi = paimaWallet.provider.getConnection().api as ConnectedAPI;
    const { providers, addresses } =
      await unshielded_erc20.connectMidnightWallet(connectedApi);

    response.stateA.unshielded_erc20 = addresses;
    response.addr = addresses.shieldedAddress;

    const {
      contract,
      state: state2,
      contractAddress,
    } = await unshielded_erc20.connectToContract(providers);
    response.contract.unshielded_erc20 = contract;
    response.stateB.unshielded_erc20 = state2;
    response.contractAddress.unshielded_erc20 = contractAddress;
  }
  {
    const connectedApi = paimaWallet.provider.getConnection().api as ConnectedAPI;
    const { providers, addresses } =
      await erc7683.connectMidnightWallet(connectedApi);

    response.stateA.erc7683 = addresses;
    response.addr = addresses.shieldedAddress;
    response.unshieldedAddr = addresses.unshieldedAddress;

    const {
      contract: erc7683Contract,
      state: erc7683State,
      contractAddress: erc7683ContractAddress,
    } = await erc7683.connectToContract(providers);
    response.contract.erc7683 = erc7683Contract;
    response.stateB.erc7683 = erc7683State;
    response.contractAddress.erc7683 = erc7683ContractAddress;
  }

  return response;
}

export async function midnight_balanceOf(_contract: any, addr: string) {
  try {
    return await balanceOfFromLedger(addr);
  } catch (error) {
    console.error("midnight_balanceOf failed:", { error });
    throw error;
  }
}

const wrapAddress = (address: string) => {
  // Midnight bech32m addresses (`mn_shield-cpk_*`) need to be decoded to the
  // raw 32-byte ZswapCoinPublicKey before being wrapped in the Either struct.
  // Plain hex strings are accepted as-is.
  const hex = address.startsWith("mn_") ? extractPublicCoinAddress(address) : address;
  return {
    is_left: true,
    left: { bytes: new Uint8Array(Buffer.from(hex, "hex")) },
    right: { bytes: new Uint8Array(32) },
  };
};

// Extracts the 32-byte ZswapCoinPublicKey from any of:
//   - a Midnight bech32m address (e.g. `mn_shield_addr_undeployed1...`)
//   - a 64-character hex string (the CPK already in hex)
// Throws on anything else so callers can't accidentally pass an unshielded
// address or an empty string.
const cpkBytes = (address: string): Uint8Array => {
  const hex = address.startsWith("mn_")
    ? extractPublicCoinAddress(address)
    : address;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `Invalid coin public key: expected 64 hex chars, got ${hex.length}`,
    );
  }
  return new Uint8Array(Buffer.from(hex, "hex"));
};

export async function createIntent(
  contract: any,
  addr: string,
  config: {
    user: string;
    orderId: string;

    originChainId: bigint;
    destinationChainId: bigint;

    maxSpent_token: string;
    maxSpent_amount: bigint;
    maxSpent_recipient: string;
    maxSpent_chainId: bigint;

    minReceived_token: string;
    minReceived_amount: bigint;
    minReceived_recipient: string;
    minReceived_chainId: bigint;

    originData: {
      targetWallet: string;
    };
  },
) {
  try {
    return await erc7683.createIntent(contract, addr, config);
  } catch (error) {
    if (error instanceof erc7683.DelegatedBalancingSentError) {
      const tx = erc7683.getLastCapturedTx();
      if (!tx) throw new Error("No transaction captured for delegation");
      await submitToBatcher(tx, "initialize", addr);
      // Return a mock result for the UI, as the batcher handles submission
      return { txId: "delegated", blockHeight: 0 };
    }
    console.error(" interface.ts: createIntent failed", { error, addr, config });
    if (error instanceof Error) {
      console.error(" interface.ts: error message", error.message);
    }
    throw error;
  }
}

export async function m20_mint(
  contract: any,
  account: string,
  amount: bigint,
) {
  // Despite the package name "unshielded-erc20", the contract's mint circuit
  // is keyed by ZswapCoinPublicKey (Either<ZswapCoinPublicKey, ContractAddress>).
  // Decode the caller's bech32m shielded address to its 32-byte CPK before
  // handing it to the contract layer.
  const accountBytes = cpkBytes(account);
  try {
    return await unshielded_erc20.mint(contract, accountBytes, amount);
  } catch (error) {
    if (error instanceof unshielded_erc20.DelegatedBalancingSentError) {
      const tx = unshielded_erc20.getLastCapturedTx();
      if (!tx) throw new Error("No transaction captured for delegation");
      await submitToBatcher(tx, "mint", account);
      return { txId: "delegated", blockHeight: 0 };
    }
    console.error(" interface.ts: m20_mint failed", { error, account, amount });
    if (error instanceof Error) {
      console.error(" interface.ts: error message", error.message);
    }
    throw error;
  }
}

export async function m20_transferFrom(
  contract: any,
  fromAccount: string,
  toAccount: string,
  amount: bigint,
) {
  const toAccountBytes = cpkBytes(toAccount);
  try {
    return await unshielded_erc20.transferFrom(
      contract,
      fromAccount,
      toAccountBytes,
      amount,
    );
  } catch (error) {
    if (error instanceof unshielded_erc20.DelegatedBalancingSentError) {
      const tx = unshielded_erc20.getLastCapturedTx();
      if (!tx) throw new Error("No transaction captured for delegation");
      await submitToBatcher(tx, "transfer", fromAccount);
      return { txId: "delegated", blockHeight: 0 };
    }
    console.error(" interface.ts: m20_transferFrom failed", {
      error,
      fromAccount,
      toAccount,
      amount,
    });
    if (error instanceof Error) {
      console.error(" interface.ts: error message", error.message);
    }
    throw error;
  }
}
