import { walletLogin, WalletMode } from "@effectstream/wallets";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

import * as unshielded_erc20 from "./contracts/erc20.ts";
import { M20_DOMAIN_SEP } from "./contracts/erc20.ts";
import * as erc7683 from "./contracts/intents.ts";
import { extractPublicCoinAddress } from "./contracts/midnight-utils.ts";
import { rawTokenType } from "@midnightntwrk/ledger-v9";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";

enum AddressType {
  MIDNIGHT = 5,
}

const BATCHER_URL =
  import.meta.env.VITE_BATCHER_URL || "http://127.0.0.1:3334";

const MIDNIGHT_NETWORK_ID =
  import.meta.env.VITE_MIDNIGHT_NETWORK_ID || "undeployed";

// Pass txStage explicitly for already-proven txs (e.g. Lace's makeTransfer);
// leave undefined for callTx-captured unproven txs so auto-detect handles them.
async function submitToBatcher(
  serializedTx: string,
  circuitId: string,
  addr: string,
  txStage?: "unproven" | "unbound" | "finalized",
) {
  console.log(`🚀 Sending ${circuitId} transaction to Batcher (stage=${txStage ?? "auto"})...`);

  const inputPayload: Record<string, unknown> = {
    tx: serializedTx,
    circuitId: circuitId,
  };
  if (txStage) inputPayload.txStage = txStage;

  const body = {
    data: {
      target: "midnight_balancing",
      address: addr,
      addressType: AddressType.MIDNIGHT,
      input: JSON.stringify(inputPayload),
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
    // Connected Lace wallet API — needed for getUnshieldedBalances() reads
    // since balances live in the wallet, not the contract ledger.
    connectedApi: null as ConnectedAPI | null,
  } as any;

  {
    const connectedApi = paimaWallet.provider.getConnection().api as ConnectedAPI;
    response.connectedApi = connectedApi;
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

// Computes the M20 unshielded token color (raw token type) for a given
// contract address. The color is what `mint_unshielded` returns and what the
// Lace wallet uses as the key in `getUnshieldedBalances()`.
// `rawTokenType` from ledger-v9 takes (domain_sep: Uint8Array, contract: hex string)
// and returns the token-type hex string directly.
export function m20TokenColor(contractAddress: string): string {
  const hex = contractAddress.startsWith("0x")
    ? contractAddress.slice(2)
    : contractAddress;
  return rawTokenType(M20_DOMAIN_SEP, hex);
}

// Reads the user's M20 balance from the connected Lace wallet's unshielded
// balances. The contract-ledger balanceOf reads from the old FungibleToken
// contract no longer apply — balances are native unshielded coins keyed by
// (contract address, M20 domain separator).
export async function midnight_balanceOf(
  connectedApi: ConnectedAPI | null | undefined,
  contractAddress: string,
): Promise<bigint> {
  if (!connectedApi) {
    throw new Error(
      "midnight_balanceOf: not connected to a Midnight wallet. Connect first.",
    );
  }
  if (!contractAddress) {
    throw new Error(
      "midnight_balanceOf: missing contract address. Is the contract deployed?",
    );
  }
  try {
    const balances = await connectedApi.getUnshieldedBalances();
    const color = m20TokenColor(contractAddress);
    return balances[color] ?? 0n;
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
    if (isDelegatedBalancingError(error)) {
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

// midnight-js's `scoped(...)` wrapper catches errors thrown inside `balanceTx`
// and re-throws them as a generic "Unexpected error submitting scoped
// transaction" Error with the original attached as `.cause`. Walk the cause
// chain so we still recognize our delegation sentinel.
const isDelegatedBalancingError = (error: unknown): boolean => {
  let cur: unknown = error;
  while (cur instanceof Error) {
    if (cur instanceof unshielded_erc20.DelegatedBalancingSentError) return true;
    if (cur.name === "DelegatedBalancingSentError") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
};

// Decodes the user's bech32m unshielded address (`mn_addr_<network>1...`)
// to its 32-byte UserAddress bytes — that's what mint_unshielded expects.
const userAddressBytes = (unshieldedAddress: string): Uint8Array => {
  if (!unshieldedAddress.startsWith("mn_addr_")) {
    throw new Error(
      `userAddressBytes: expected bech32m unshielded address (mn_addr_...), got "${unshieldedAddress}"`,
    );
  }
  const parsed = MidnightBech32m.parse(unshieldedAddress);
  return Uint8Array.prototype.slice.call(parsed.data, 0, 32);
};

// Mints native unshielded M20 coins to the caller's own unshielded address.
// The minted coin appears in the user's Lace wallet under the M20 token color
// (see m20TokenColor() / midnight_balanceOf()).
export async function m20_mint(
  contract: any,
  unshieldedAddress: string,
  amount: bigint,
) {
  const recipientBytes = userAddressBytes(unshieldedAddress);
  try {
    return await unshielded_erc20.mintUnshielded(contract, recipientBytes, amount);
  } catch (error) {
    if (isDelegatedBalancingError(error)) {
      const tx = unshielded_erc20.getLastCapturedTx();
      if (!tx) throw new Error("No transaction captured for delegation");
      await submitToBatcher(tx, "mint_unshielded", unshieldedAddress);
      return { txId: "delegated", blockHeight: 0 };
    }
    console.error(" interface.ts: m20_mint failed", {
      error,
      unshieldedAddress,
      amount,
    });
    if (error instanceof Error) {
      console.error(" interface.ts: error message", error.message);
    }
    throw error;
  }
}

// Sends M20 to the filler via the balancing batcher so the user needs no DUST.
export async function m20_transferFrom(
  connectedApi: ConnectedAPI,
  contractAddress: string,
  fromAccount: string,
  toAccount: string,
  amount: bigint,
) {
  const tokenColor = m20TokenColor(contractAddress);
  try {
    return await unshielded_erc20.transferFrom(
      connectedApi,
      tokenColor,
      toAccount,
      amount,
    );
  } catch (error) {
    if (isDelegatedBalancingError(error)) {
      const tx = unshielded_erc20.getLastCapturedTx();
      if (!tx) throw new Error("No transaction captured for delegation");
      // Lace's makeTransfer returns a finalized tx, so hint the batcher.
      await submitToBatcher(tx, "unshielded_transfer", fromAccount, "finalized");
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
