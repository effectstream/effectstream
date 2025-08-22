// import * as Paima from "./paima/middleware.js";
import type { LobbyState, LobbyStateQuery, UserLobby } from "@chess/utils";
import type { MatchState, TickEvent } from "@chess/game-logic";
// import type { MatchExecutor } from "@paimaexample/sdk/executors";
// import type { PackedUserStats } from "./paima/middleware";
// import type { LoginInfo } from "@paimaexample/sdk/mw-core
type LoginInfo = any;
type MatchExecutor = any;
type PackedUserStats = any;
import { ethers } from "ethers";

import * as Paima from "@chess/middleware";
// Paima.default.createLobby(1, 1, 1, 1, false, false, true);
// const Paima = {
//   default: {
//     userWalletLogin: async (loginInfo: LoginInfo) => {
//       return { success: true, result: { walletAddress: "0x123" } };
//     },
//     getLobbyState: async (lobbyId: string) => {
//       return { success: true, lobby: { lobby_state: "open" } };
//     },
//     getLobbySearch: async (
//       userAddress: string | null,
//       query: string,
//       page: number,
//       limit: number,
//     ) => {
//       return { success: true, lobbies: [] };
//     },
//     createLobby: async (
//       numOfRounds: number,
//       roundLength: number,
//       timePerPlayer: number,
//       botDifficulty: number,
//       isHidden: boolean,
//       isPractice: boolean,
//       isWhite: boolean,
//     ) => {
//       return { success: true, lobbyID: "123" };
//     },
//     joinLobby: async (lobbyId: string) => {
//       return { success: true, lobby: { lobby_state: "open" } };
//     },
//     getOpenLobbies: async (
//       userAddress: string | null,
//       page: number,
//       limit: number,
//     ) => {
//       return { success: true, lobbies: [] };
//     },
//     getUserLobbiesMatches: async (
//       userAddress: string | null,
//       page: number,
//       limit: number,
//     ) => {
//       return { success: true, lobbies: [] };
//     },
//     getUserStats: async (userAddress: string) => {
//       return { success: true, stats: { rating: 1000 } };
//     },
//     getMatchExecutor: async (lobbyId: string) => {
//       return { success: true, result: { executor: { execute: () => {} } } };
//     },
//     closeLobby: async (lobbyId: string) => {
//       return { success: true, lobby: { lobby_state: "open" } };
//     },
//   },
// };

// The MainController is a React component that will be used to control the state of the application
// It will be used to check if the user has metamask installed and if they are connected to the correct network
// Other settings also will be controlled here

// create string enum called AppState
export enum Page {
  Login = "/login",
  MainMenu = "/",
  CreateLobby = "/create_lobby",
  OpenLobbies = "/open_lobbies",
  Game = "/game",
  MyGames = "/my_games",
}

// This is a class that will be used to control the state of the application
// the benefit of this is that it is very easy to test its logic unlike a react component
export class MainController {
  userAddress: string | null = null;

  callback: (
    page: Page | null,
    isLoading: boolean,
    extraData: LobbyState | null,
  ) => void = () => {};

  private checkCallback() {
    if (this.callback == null) {
      console.error("Callback is not set");
    }
  }

  private async enforceWalletConnected() {
    this.checkCallback();
    if (!this.isWalletConnected() || !this.userAddress) {
      this.callback(Page.Login, false, null);
    }
  }

  private isWalletConnected = (): boolean => {
    return typeof (globalThis as any).ethereum !== "undefined" ? true : false;
  };



  async connectWallet(loginInfo: LoginInfo) {
    this.callback(Page.Login, true, null);
    
    //const response = await Paima.default.userWalletLogin(loginInfo);
    // console.log("connect wallet response: ", response);
      // Get the provider and signer from the browser window
  const provider = new ethers.providers.Web3Provider((globalThis as any).ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);

  const signer = provider.getSigner();
  console.log({ signer, provider, accounts });
    // if (response.success === true) {
      this.userAddress = accounts[0];
      this.callback(Page.MainMenu, false, null);
    // } else {
    //   this.callback(Page.Login, false, null);
    // }
  }

  async loadLobbyState(lobbyId: string): Promise<LobbyState> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.getLobbyState(lobbyId);
    console.log("get lobby state response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get lobby state");
    }
    return response.lobby as unknown as LobbyState;
  }

  async searchLobby(query: string, page: number): Promise<LobbyStateQuery[]> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.getLobbySearch(
      this.userAddress as string,
      query,
      page,
      1,
    );
    console.log("search lobby response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not search lobby");
    }
    return response.lobbies;
  }

  async createLobby(
    userAddress: string,
    numOfRounds: number,
    roundLength: number,
    timePerPlayer: number,
    botDifficulty: number,
    isHidden = false,
    isPractice = false,
    isWhite = true,
  ): Promise<void> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.createLobby(
      userAddress,
      numOfRounds,
      roundLength,
      timePerPlayer,
      botDifficulty,
      isHidden,
      isPractice,
      isWhite,
    );
    console.log(" : ", response);
    if (!response.success) {
      this.callback(null, false, null);
      throw new Error("Could not create lobby");
    }
    const lobbyState = await this.loadLobbyState(response.lobbyID);
    this.callback(Page.Game, false, lobbyState);
  }

  async joinLobby(lobbyId: string): Promise<void> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.joinLobby(lobbyId);
    if (!response.success) {
      this.callback(null, false, null);
      throw new Error("Could not join lobby");
    }
    const resp = await Paima.default.getLobbyState(lobbyId);
    console.log("move to joined lobby response: ", response);
    if (!resp.success) {
      this.callback(null, false, null);
      throw new Error("Could not download lobby state from join lobby");
    }
    this.callback(Page.Game, false, resp.lobby as unknown as LobbyState);
  }

  async moveToJoinedLobby(lobbyId: string): Promise<void> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.getLobbyState(lobbyId);
    console.log("move to joined lobby response: ", response);
    if (!response.success) {
      this.callback(null, false, null);
      throw new Error("Could not join lobby");
    }
    this.callback(Page.Game, false, response.lobby as unknown as LobbyState);
  }

  async closeLobby(lobbyId: string): Promise<void> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.closeLobby(lobbyId);
    console.log("close lobby response: ", response);
    if (!response.success) {
      this.callback(null, false, null);
      throw new Error("Could not close lobby");
    }
    this.callback(Page.MainMenu, false, null);
  }

  async getOpenLobbies(page = 0, limit = 100): Promise<LobbyStateQuery[]> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.getOpenLobbies(
      this.userAddress,
      page,
      limit,
    );
    console.log("get open lobbies response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get open lobbies");
    }
    return response.lobbies.filter(
      (lobby: LobbyState) => lobby.lobby_state === "open",
    );
  }

  async getMyGames(page = 0, limit = 100): Promise<UserLobby[]> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.getUserLobbiesMatches(
      this.userAddress,
      page,
      limit,
    );
    console.log("get my games response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get open lobbies");
    }
    return response.lobbies;
  }

  async getStats(): Promise<PackedUserStats> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.getUserStats(this.userAddress!);
    console.log("get stats response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get user stats");
    }
    return response;
  }

  async getMatchExecutor(
    lobbyId: string,
  ): Promise<MatchExecutor> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await Paima.default.getMatchExecutor(lobbyId);
    console.log("get match executor: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get match executor");
    }
    return response.result;
  }
}
