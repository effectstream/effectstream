import {
  allInjectedWallets,
  PaimaEngineConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@paimaexample/wallets";

import { hardhat } from "viem/chains";

export const paimaEngineConfig = new PaimaEngineConfig(
  "",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  undefined,
  false,
);

let wallet = null;
async function login() {
  const result = await walletLogin({
    mode: WalletMode.EvmInjected,
  });
  if (!result.success) throw new Error("Cannot login");
  wallet = result.result;
  return wallet;
}

async function sendTransactionPaimaL2(input) {
  const result = await sendTransaction(
    wallet,
    ["my_action_name", input ?? "no-text"],
    paimaEngineConfig,
  );
  return result;
}

window.paima = {
  login,
  sendTransactionPaimaL2,
};
