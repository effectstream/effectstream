import {
  PaimaEngineConfig,
  sendTransaction,
  WalletMode,
  walletLogin,
  allInjectedWallets,
} from "@paimaexample/wallets";

import { hardhat } from "viem/chains";

export const paimaEngineConfig = new PaimaEngineConfig(
  "",
  "mainEvmRPC",
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  hardhat,
  undefined,
  undefined,
  false
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
