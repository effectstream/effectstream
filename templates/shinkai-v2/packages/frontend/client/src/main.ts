import { Application, Assets } from "pixi.js";
import { walletLogin, WalletMode } from "@effectstream/wallets";
import { hardhat } from "viem/chains";
import { paimaConfig } from "./config.ts";
import { MainScreen } from "./screens.ts";
import { GameState } from "./game-state.ts";

const fontAssets = [
  { alias: "oswald", src: "/assets/fonts/Oswald-VariableFont_wght.ttf", data: { family: "Oswald" } },
];

const preAssets = [
  "/assets/img/castle.png",
  "/assets/img/name.png",
  "/assets/img/wow.png",
  "/assets/img/button/b1.png",
  "/assets/img/token.png",
];

const postAssets = [
  "/assets/img/tiger.png",
  "/assets/img/bison.png",
  "/assets/img/monkey.png",
  "/assets/img/panda.png",
  "/assets/img/button/b2.png",
];

export async function connectWallet(): Promise<string> {
  const result = await walletLogin({
    mode: WalletMode.EvmInjected,
    preferBatchedMode: true,
    chain: hardhat,
  });
  if (!result.success) throw new Error("Wallet connection failed");
  GameState.wallet = result.result.walletAddress;
  return result.result.walletAddress;
}

(async () => {
  GameState.app = new Application();
  await GameState.app.init({ width: 1024, height: 1024 });
  document.body.appendChild(GameState.app.canvas);

  Assets.addBundle("fonts", fontAssets);
  await Promise.all([Assets.loadBundle("fonts"), ...preAssets.map((a) => Assets.load(a))]);

  const start = new MainScreen();
  start.assets.forEach((d) => GameState.app.stage.addChild(d));
  GameState.elapsed = 0.0;
  GameState.currentScreen = start;

  GameState.app.ticker.add((ticker) => {
    GameState.elapsed += ticker.deltaTime;
    GameState.tick();
  });

  await Promise.all([...postAssets.map((a) => Assets.load(a))]);
  GameState.ready = true;
})();
