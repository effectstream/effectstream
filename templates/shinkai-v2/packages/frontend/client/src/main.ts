import { Application, Assets } from "pixi.js";
import { MainScreen } from "./screens.ts";
import { GameState } from "./game-state.ts";
import { showWalletPicker } from "./wallet-picker.ts";

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

/**
 * Re-enable the CIP-30 session for the currently-connected Cardano wallet and
 * patch the fresh API into the cached `CardanoProvider`. The
 * `@effectstream/wallets` `CardanoConnector` caches the provider per-wallet-name,
 * so calling `walletLogin` again hands back the same provider with its now-dead
 * `conn.api` reference — `signData` will keep failing with "No account found
 * for origin" until the underlying api is replaced. Calling
 * `window.cardano[<name>].enable()` returns a fresh CIP-30 API (and prompts
 * the user to unlock / re-approve as needed). We swap that into the cached
 * provider so subsequent `signMessage` calls use the live session.
 */
export async function refreshCardanoSession(): Promise<void> {
  if (GameState.walletType !== "cardano") return;
  const w = GameState.walletObj;
  if (!w) return;
  const name: string | undefined = (w.provider as any)?.conn?.metadata?.name;
  if (!name) return;
  const ext = (window as any).cardano?.[name];
  if (!ext?.enable) return;
  const freshApi = await ext.enable();
  (w.provider as any).conn.api = freshApi;
}

export async function connectWallet(): Promise<string> {
  const { wallet, walletType } = await showWalletPicker();
  GameState.walletType = walletType;
  return wallet;
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
