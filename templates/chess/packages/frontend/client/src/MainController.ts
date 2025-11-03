import type { LobbyState, LobbyStateQuery, UserLobby } from "@chess/utils";
type LoginInfo = any;
type MatchExecutor = any;
type PackedUserStats = any;
import { type Wallet, walletLogin } from "@effectstream/wallets";
import {
  apiGetLobbySearch,
  apiGetLobbyState,
  apiGetMatchExecutor,
  apiGetOpenLobbies,
  apiGetUserLobbiesMatches,
  apiGetUserStats,
} from "./api/endpoints/queries.ts";
import {
  apiCloseLobby,
  apiCreateLobby,
  apiJoinLobby,
} from "./api/endpoints/write.ts";
import { paimaEngineConfig } from "./PaimaEngineConfig.ts";
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
  wallet: Wallet | null = null;

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
    this.isWalletConnected();
    if (!this.userAddress) {
      this.callback(Page.Login, false, null);
    }
  }

  // TODO What is this doing?
  private isWalletConnected = (): boolean => {
    const isConnected = typeof (globalThis as any).ethereum !== "undefined"
      ? true
      : false;
    console.log("is wallet connected: ", isConnected);
    return true;
  };

  async connectWallet(loginInfo: LoginInfo) {
    this.callback(Page.Login, true, null);
    const response = await walletLogin(loginInfo);
    console.log("connect wallet response: ", response);
    if (response.success === true) {
      this.wallet = response.result;
      this.userAddress = response.result.provider.getAddress().address;
      this.callback(Page.MainMenu, false, null);
    } else {
      this.callback(Page.Login, false, null);
    }
  }

  async loadLobbyState(lobbyId: string): Promise<LobbyState> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await apiGetLobbyState(lobbyId);
    console.log("get lobby state response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get lobby state");
    }
    return response.result;
  }

  async searchLobby(query: string, page: number): Promise<LobbyStateQuery[]> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await apiGetLobbySearch(
      this.wallet!.provider.getAddress().address,
      query,
      page,
      1,
    );
    console.log("search lobby response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not search lobby");
    }
    return response.result;
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
    const response = await apiCreateLobby(
      this.wallet!,
      paimaEngineConfig,
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
    const lobbyState = await this.loadLobbyState(response.result.lobby_id);
    this.callback(Page.Game, false, lobbyState);
  }

  async joinLobby(lobbyId: string): Promise<void> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await apiJoinLobby(this.wallet!, paimaEngineConfig, lobbyId);
    if (!response.success) {
      this.callback(null, false, null);
      throw new Error("Could not join lobby");
    }
    const resp = await apiGetLobbyState(lobbyId);
    console.log("move to joined lobby response: ", response);
    if (!resp.success) {
      this.callback(null, false, null);
      throw new Error("Could not download lobby state from join lobby");
    }
    this.callback(Page.Game, false, resp.result as unknown as LobbyState);
  }

  async moveToJoinedLobby(lobbyId: string): Promise<void> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await apiGetLobbyState(lobbyId);
    console.log("move to joined lobby response: ", response);
    if (!response.success) {
      this.callback(null, false, null);
      throw new Error("Could not join lobby");
    }
    this.callback(Page.Game, false, response.result as unknown as LobbyState);
  }

  async closeLobby(lobbyId: string): Promise<void> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await apiCloseLobby(this.wallet!, paimaEngineConfig, lobbyId);
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
    const response = await apiGetOpenLobbies(
      this.wallet!.provider.getAddress().address,
      page,
      limit,
    );
    console.log("get open lobbies response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get open lobbies");
    }
    return response.result.filter(
      (lobby: LobbyStateQuery) => lobby.lobby_state === "open",
    );
  }

  async getMyGames(page = 0, limit = 100): Promise<(LobbyState & { myTurn: boolean })[]> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await apiGetUserLobbiesMatches(
      this.wallet!.provider.getAddress().address,
      page,
      limit,
    );
    console.log("get my games response: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get open lobbies");
    }
    return response.result;
  }

  async getStats(): Promise<PackedUserStats> {
    await this.enforceWalletConnected();
    this.callback(null, true, null);
    const response = await apiGetUserStats(
      this.wallet!.provider.getAddress().address,
    );
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
    const response = await apiGetMatchExecutor(lobbyId);
    console.log("get match executor: ", response);
    this.callback(null, false, null);
    if (!response.success) {
      throw new Error("Could not get match executor");
    }
    return response.result;
  }
}
