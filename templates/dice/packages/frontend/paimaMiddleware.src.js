import {
  PaimaEngineConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@paimaexample/wallets";

import { hardhat } from "viem/chains";

const paimaEngineConfig = new PaimaEngineConfig(
  "dice",
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

  async getLobbyState(lobbyId) {
    try {
      const response = await fetch(`http://localhost:9999/lobby/${lobbyId}`);
      const data = await response.json();
      if (!data) {
        return { success: false, errorMessage: "Lobby not found" };
      }
      return {
        success: true,
        lobby: data,
      };
    } catch (error) {
      console.error("Error fetching lobby state:", error);
      return { success: false };
    }
  },

  // Alias for getLobbyState
  async getLobbyRaw(lobbyId) {
    return this.getLobbyState(lobbyId);
  },

  async getOpenLobbies(nftId, page = 0, count = 10) {
    try {
      // Note: nftId is passed for compatibility but not used - open lobbies are public
      const response = await fetch(
        `http://localhost:9999/open_lobbies?page=${page}&count=${count}`
      );
      if (!response.ok) {
        console.error(`Error fetching open lobbies: ${response.status} ${response.statusText}`);
        return { success: false };
      }
      const data = await response.json();
      return {
        success: true,
        lobbies: data,
      };
    } catch (error) {
      console.error("Error fetching open lobbies:", error);
      return { success: false };
    }
  },

  async getActiveLobbies(page = 0, count = 10) {
    try {
      const response = await fetch(
        `http://localhost:9999/lobbies/active?page=${page}&count=${count}`
      );
      if (!response.ok) {
        console.error(`Error fetching active lobbies: ${response.status} ${response.statusText}`);
        return { success: false };
      }
      const data = await response.json();
      return {
        success: true,
        lobbies: data,
      };
    } catch (error) {
      console.error("Error fetching active lobbies:", error);
      return { success: false };
    }
  },

  async getUserLobbies(wallet, page = 0, count = 10) {
    try {
      const response = await fetch(
        `http://localhost:9999/user_lobbies?wallet=${wallet}&page=${page}&count=${count}`
      );
      if (!response.ok) {
        console.error(`Error fetching user lobbies: ${response.status} ${response.statusText}`);
        return { success: false };
      }
      const data = await response.json();
      return {
        success: true,
        lobbies: data,
      };
    } catch (error) {
      console.error("Error fetching user lobbies:", error);
      return { success: false };
    }
  },

  async getRoundData(lobbyId, roundNumber) {
    try {
      const response = await fetch(
        `http://localhost:9999/lobby/${lobbyId}/round/${roundNumber}`
      );
      const data = await response.json();
      return {
        success: true,
        round: data,
      };
    } catch (error) {
      console.error("Error fetching round data:", error);
      return { success: false };
    }
  },

  async getRoundsForLobby(lobbyId) {
    try {
      const response = await fetch(
        `http://localhost:9999/lobby/${lobbyId}/rounds`
      );
      const data = await response.json();
      return {
        success: true,
        rounds: data,
      };
    } catch (error) {
      console.error("Error fetching rounds:", error);
      return { success: false };
    }
  },

  async getMovesForLobby(lobbyId) {
    try {
      const response = await fetch(
        `http://localhost:9999/lobby/${lobbyId}/moves`
      );
      const data = await response.json();
      return {
        success: true,
        moves: data,
      };
    } catch (error) {
      console.error("Error fetching moves:", error);
      return { success: false };
    }
  },

  async getMatchResult(lobbyId) {
    try {
      const response = await fetch(
        `http://localhost:9999/lobby/${lobbyId}/result`
      );
      const data = await response.json();
      return {
        success: true,
        result: data,
      };
    } catch (error) {
      console.error("Error fetching match result:", error);
      return { success: false };
    }
  },

  async createLobby(creatorNftId, numOfRounds, roundLength, timePerPlayer, isHidden = false, isPractice = false) {
    try {
      const params = ["createdLobby", creatorNftId, numOfRounds, roundLength, timePerPlayer, isHidden, isPractice];

      const result = await sendTransaction(wallet, params, paimaEngineConfig);

      if (!result.success) {
        return { success: false, errorMessage: "Failed to create lobby" };
      }

      // Wait for the transaction to be processed and indexed
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Query for the user's most recent lobby
      try {
        // Get wallet address - handle both direct address string and wallet object
        const walletAddr = typeof wallet === 'string' ? wallet : wallet?.walletAddress?.address || wallet?.address;
        const response = await fetch(
          `http://localhost:9999/user_lobbies?wallet=${walletAddr}&page=0&count=1`
        );
        if (!response.ok) {
          return { success: false, errorMessage: "Failed to fetch created lobby" };
        }
        const lobbies = await response.json();
        if (lobbies && lobbies.length > 0) {
          return {
            success: true,
            lobbyID: lobbies[0].lobby_id,
            lobbyStatus: lobbies[0].lobby_state,
          };
        }
      } catch (fetchError) {
        console.error("Error fetching created lobby:", fetchError);
      }

      // Fallback: return error if we couldn't find the lobby
      return {
        success: false,
        errorMessage: "Lobby created but could not retrieve lobby ID",
      };
    } catch (error) {
      console.error("Error creating lobby:", error);
      return { success: false, errorMessage: error.message };
    }
  },

  async joinLobby(nftId, lobbyId) {
    try {
      const result = await sendTransaction(
        wallet,
        ["joinedLobby", nftId, lobbyId],
        paimaEngineConfig
      );
      return result;
    } catch (error) {
      console.error("Error joining lobby:", error);
      return { success: false };
    }
  },

  async closeLobby(lobbyId) {
    try {
      const result = await sendTransaction(
        wallet,
        ["closedLobby", lobbyId],
        paimaEngineConfig
      );
      return result;
    } catch (error) {
      console.error("Error closing lobby:", error);
      return { success: false };
    }
  },

  async submitMoves(nftId, lobbyId, matchWithinLobby, roundWithinMatch, rollAgain) {
    try {
      const result = await sendTransaction(
        wallet,
        ["submittedMoves", nftId, lobbyId, matchWithinLobby, roundWithinMatch, rollAgain],
        paimaEngineConfig
      );
      return result;
    } catch (error) {
      console.error("Error submitting move:", error);
      return { success: false };
    }
  },

  async getNftsForWallet(walletAddress) {
    try {
      const response = await fetch(
        `http://localhost:9999/nfts?wallet=${walletAddress}`
      );
      if (!response.ok) {
        console.error(`Error fetching NFTs: ${response.status} ${response.statusText}`);
        return { success: false };
      }
      const data = await response.json();
      return {
        success: true,
        result: data.nfts || [],
      };
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      return { success: false };
    }
  },
};

export default endpoints;
export { WalletMode };
