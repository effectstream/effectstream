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

  async getUserLobbiesMatches(nftId, page = 0, count = 10) {
    try {
      // For now, use the same endpoint as getUserLobbies
      // We need to get the wallet address for this NFT first
      // Since we don't have a direct NFT->wallet lookup in the middleware,
      // we'll query lobbies where this NFT is a player
      const response = await fetch(
        `http://localhost:9999/user_lobbies_by_nft?nft_id=${nftId}&page=${page}&count=${count}`
      );
      if (!response.ok) {
        console.error(`Error fetching user lobbies by NFT: ${response.status} ${response.statusText}`);
        return { success: false };
      }
      const data = await response.json();
      return {
        success: true,
        lobbies: data,
      };
    } catch (error) {
      console.error("Error fetching user lobbies by NFT:", error);
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

  async getRoundExecutor(lobbyId, matchWithinLobby, roundWithinMatch, initialMatchState) {
    try {
      // Validate inputs
      if (matchWithinLobby == null || roundWithinMatch == null) {
        return { success: false, errorMessage: "Invalid match or round number" };
      }

      // Fetch the round moves
      const movesResponse = await fetch(
        `http://localhost:9999/lobby/${lobbyId}/match/${matchWithinLobby}/round/${roundWithinMatch}/moves`
      );
      if (!movesResponse.ok) {
        return { success: false, errorMessage: "Failed to fetch round moves" };
      }
      const moves = await movesResponse.json();

      // Fetch the round data to get the seed
      const roundResponse = await fetch(
        `http://localhost:9999/lobby/${lobbyId}/match/${matchWithinLobby}/round/${roundWithinMatch}`
      );
      if (!roundResponse.ok) {
        return { success: false, errorMessage: "Failed to fetch round data" };
      }
      const roundData = await roundResponse.json();

      // Fetch the lobby state to get num of rounds
      const lobbyResponse = await fetch(`http://localhost:9999/lobby/${lobbyId}`);
      if (!lobbyResponse.ok) {
        return { success: false, errorMessage: "Failed to fetch lobby state" };
      }
      const lobbyData = await lobbyResponse.json();

      // Add the round seed and actual round number to lobbyData
      // Use the roundWithinMatch parameter (the round we're fetching) instead of lobbyData.current_round
      lobbyData.roundSeed = roundData?.roundSeed || "default-seed";
      lobbyData.roundWithinMatch = roundWithinMatch;

      // Return data needed for RoundExecutorWrapper (created in TypeScript frontend code)
      return {
        success: true,
        result: {
          moves,
          lobbyData,
          initialMatchState,
        },
      };
    } catch (error) {
      console.error("Error fetching round executor data:", error);
      return { success: false, errorMessage: error.message };
    }
  },

  async createLobby(creatorNftId, numOfRounds, roundLength, timePerPlayer, isHidden = false, isPractice = false) {
    try {
      const params = ["createdLobby", creatorNftId, numOfRounds, roundLength, timePerPlayer, isHidden, isPractice];

      const result = await sendTransaction(wallet, params, paimaEngineConfig);

      if (!result.success) {
        return { success: false, errorMessage: "Failed to create lobby" };
      }

      // Poll for the lobby by NFT ID (more reliable than wallet address)
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between attempts

        try {
          const response = await fetch(
            `http://localhost:9999/user/${creatorNftId}/lobbies?page=0&count=1`
          );
          if (!response.ok) {
            continue;
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
          // Continue polling on error
          continue;
        }
      }

      // Fallback: return error if we couldn't find the lobby after all retries
      return {
        success: false,
        errorMessage: "Lobby created but could not retrieve lobby ID after 15 attempts",
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
