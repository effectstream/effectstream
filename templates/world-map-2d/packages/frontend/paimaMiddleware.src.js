import {
  PaimaEngineConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@paimaexample/wallets";

import { hardhat } from "viem/chains";

const paimaEngineConfig = new PaimaEngineConfig(
  "world-map-2d",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  undefined,
  false,
);

let wallet = null;

const endpoints = {
  async userWalletLogin({ mode, preferBatchedMode }) {
    const result = await walletLogin({
      mode,
      chain: paimaEngineConfig.paimaL2Chain,
    });
    if (!result.success) {
      return { success: false };
    }
    wallet = result.result;
    return {
      success: true,
      result: {
        walletAddress: wallet.walletAddress.address,
        ...wallet,
      },
    };
  },

  async getUserStats(walletAddress) {
    try {
      const response = await fetch(
        `http://localhost:9999/user_stats?wallet=${walletAddress}`
      );
      const data = await response.json();
      return {
        success: true,
        stats: data,
      };
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return { success: false };
    }
  },

  async getWorldStats() {
    try {
      const response = await fetch(`http://localhost:9999/world_stats`);
      const data = await response.json();
      return {
        success: true,
        stats: data,
      };
    } catch (error) {
      console.error("Error fetching world stats:", error);
      return { success: false };
    }
  },

  async joinWorld() {
    try {
      const result = await sendTransaction(wallet, ["joinWorld"], paimaEngineConfig);
      return result;
    } catch (error) {
      console.error("Error joining world:", error);
      return { success: false };
    }
  },

  async submitMoves(x, y) {
    try {
      const result = await sendTransaction(
        wallet,
        ["submitMove", x, y],
        paimaEngineConfig
      );
      return result;
    } catch (error) {
      console.error("Error submitting move:", error);
      return { success: false };
    }
  },

  async submitIncrement(x, y) {
    try {
      const result = await sendTransaction(
        wallet,
        ["submitIncrement", x, y],
        paimaEngineConfig
      );
      return result;
    } catch (error) {
      console.error("Error submitting increment:", error);
      return { success: false };
    }
  },
};

export default endpoints;
export { WalletMode };
