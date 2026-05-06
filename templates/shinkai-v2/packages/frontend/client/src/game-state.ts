import type { Application, Container } from "pixi.js";
import type { QFTScreen } from "./screens.ts";
import type { Wallet } from "@effectstream/wallets";

export class GameState {
  public static currentScreen: QFTScreen | null = null;
  public static elapsed = 0.0;
  public static isLoading = false;
  public static gameId = -1;
  public static wallet: string = "";
  public static walletObj: Wallet | null = null;
  public static ready = false;
  public static app: Application;
  public static persistentUI: Container[] = [];

  public static tick() {
    try {
      GameState.currentScreen?.tick();
    } catch (e) {
      console.log("Missed tick", e);
    }
  }
}
