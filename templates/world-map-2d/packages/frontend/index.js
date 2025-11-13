import {
  allInjectedWallets,
  EffectstreamEngineConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@paimaexample/wallets";

import { hardhat } from "viem/chains";

export const effectStreamConfig = new EffectstreamEngineConfig(
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
    chain: effectStreamConfig.paimaL2Chain,
  });
  if (!result.success) throw new Error("Cannot login");
  wallet = result.result;
  console.log("Logged in with wallet:", wallet.walletAddress);
  return wallet;
}

async function joinWorld() {
  const result = await sendTransaction(
    wallet,
    ["j"],
    effectStreamConfig,
  );
  console.log("Join world result:", result);
  return result;
}

async function submitMove(x, y) {
  const result = await sendTransaction(
    wallet,
    ["@m", x.toString(), y.toString()],
    effectStreamConfig,
  );
  console.log("Submit move result:", result);
  return result;
}

async function submitIncrement(x, y) {
  const result = await sendTransaction(
    wallet,
    ["i", "*" + x.toString(), "*" + y.toString()],
    effectStreamConfig,
  );
  console.log("Submit increment result:", result);
  return result;
}

window.effectstream = {
  login,
  joinWorld,
  submitMove,
  submitIncrement,
};
