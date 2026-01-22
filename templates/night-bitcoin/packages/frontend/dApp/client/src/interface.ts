import { walletLogin, WalletMode } from "@paimaexample/wallets";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

import * as unshielded_erc20 from "./contracts/erc20.ts";
import * as erc7683 from "./contracts/intents.ts";

export async function loginMidnight() {
  const result = await walletLogin({
    mode: WalletMode.Midnight,
    networkId: "undeployed",
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
    const connectedApi = paimaWallet.provider.getConnection()
      .api as ConnectedAPI;
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
    const connectedApi = paimaWallet.provider.getConnection()
      .api as ConnectedAPI;
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


export async function midnight_balanceOf(contract: any, addr: string) {
  try {
    console.log("Balance of", contract, addr);
    return await unshielded_erc20.balanceOf(addr);
  } catch (error) {
    console.error(0, { error });
    throw error;
  }
}

export async function createIntent(
  contract: any,
  addr: string,
  config: {
    user: string,
    orderId: string,

    originChainId: bigint,
    destinationChainId: bigint,
    
    maxSpent_token: string,
    maxSpent_amount: bigint,
    maxSpent_recipient: string,
    maxSpent_chainId: bigint,

    minReceived_token: string,
    minReceived_amount: bigint,
    minReceived_recipient: string,
    minReceived_chainId: bigint,

    originData: {
      targetWallet: string,
    },
},
) {
  try {
    return await erc7683.createIntent(contract, addr, config);
  } catch (error) {
    console.error(" interface.ts: createIntent failed", { error, addr, config });
    console.error(" interface.ts: error cause message", (error as any).cause?.failure?.message);
    if (error instanceof Error) {
      console.error(" interface.ts: error message", error.message);
      console.error(" interface.ts: error stack", error.stack);
    }
    throw error;
  }
}

export async function m20_mint(
  contract: any,
  account: string,
  amount: bigint,
) {
  try {
    return await unshielded_erc20.mint(contract, account, amount);
  } catch (error) {
    console.error(" interface.ts: m20_mint failed", { error, account, amount });
    if (error instanceof Error) {
      console.error(" interface.ts: error message", error.message);
      console.error(" interface.ts: error stack", error.stack);
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
  try {
    return await unshielded_erc20.transferFrom(contract, fromAccount, toAccount, amount);
  } catch (error) {
    console.error(" interface.ts: m20_transferFrom failed", { error, fromAccount, toAccount, amount });
    if (error instanceof Error) {
      console.error(" interface.ts: error message", error.message);
      console.error(" interface.ts: error stack", error.stack);
    }
    throw error;
  }
}
