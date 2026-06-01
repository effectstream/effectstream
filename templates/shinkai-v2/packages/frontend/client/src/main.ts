import { Application, Assets, Sprite, Text } from "pixi.js";
import { allInjectedWallets, walletLogin, WalletMode } from "@effectstream/wallets";
import { paimaConfig } from "./config.ts";
import { MainScreen } from "./screens.ts";
import { GameState } from "./game-state.ts";
import { createButton, loader } from "./graphics.ts";

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

async function pickCardanoWallet(
  options: { metadata: { name: string; displayName: string } }[],
): Promise<string> {
  return await new Promise((resolve) => {
    const overlay = loader(GameState.app);
    const title = new Text({
      text: "Choose a Cardano wallet",
      style: { fontFamily: "oswald", fontSize: 48, fill: "#fff", align: "center", dropShadow: true },
    });
    title.anchor.set(0.5, 0.5);
    title.x = 512;
    title.y = 240;
    GameState.app.stage.addChild(title);

    const created: { sprite: Sprite; text: Text }[] = [];
    const cleanup = () => {
      title.destroy();
      created.forEach(({ sprite, text }) => { sprite.destroy(); text.destroy(); });
      overlay.forEach((o) => o.destroy());
    };

    options.forEach((opt, i) => {
      const [sprite, text] = createButton(320, 340 + i * 120, opt.metadata.displayName, () => {
        cleanup();
        resolve(opt.metadata.name);
      });
      GameState.app.stage.addChild(sprite);
      GameState.app.stage.addChild(text);
      created.push({ sprite, text });
    });
  });
}

/**
 * Re-enable the CIP-30 session for the currently-connected wallet and patch
 * the fresh API into the cached `CardanoProvider`. The `@effectstream/wallets`
 * `CardanoConnector` caches the provider per-wallet-name, so calling
 * `walletLogin` again hands back the same provider with its now-dead
 * `conn.api` reference — `signData` will keep failing with "No account found
 * for origin" until the underlying api is replaced. Calling
 * `window.cardano[<name>].enable()` returns a fresh CIP-30 API (and prompts
 * the user to unlock / re-approve as needed). We swap that into the cached
 * provider so subsequent `signMessage` calls use the live session.
 */
export async function refreshCardanoSession(): Promise<void> {
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
  const injected = await allInjectedWallets();
  const cardanoWallets = injected[WalletMode.Cardano] ?? [];
  if (cardanoWallets.length === 0) {
    throw new Error("No Cardano wallet detected. Install Nami, Lace, Eternl, or another CIP-30 wallet.");
  }

  const chosen = cardanoWallets.length === 1
    ? cardanoWallets[0].metadata.name
    : await pickCardanoWallet(cardanoWallets);

  const result = await walletLogin({
    mode: WalletMode.Cardano,
    preference: { name: chosen },
  });
  if (!result.success) throw new Error(`Wallet connection failed: ${result.errorMessage}`);
  GameState.walletObj = result.result;
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
