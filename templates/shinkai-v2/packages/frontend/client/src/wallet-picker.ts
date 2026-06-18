import { Sprite, Text, Graphics } from "pixi.js";
import { allInjectedWallets, walletLogin, WalletMode } from "@effectstream/wallets";
import type { Wallet } from "@effectstream/wallets";
import { GameState } from "./game-state.ts";
import { loader, createButton } from "./graphics.ts";
import { connectSocialWallet } from "./social-wallet-provider.ts";

type WalletType = "evm" | "cardano" | "social";

// ── Cardano sub-picker (mirrors the original pickCardanoWallet in main.ts) ─
async function pickCardanoWallet(
  options: { metadata: { name: string; displayName: string } }[],
): Promise<string> {
  return new Promise((resolve) => {
    const overlay = loader(GameState.app);
    const title = new Text({
      text: "Choose a Cardano wallet",
      style: { fontFamily: "oswald", fontSize: 42, fill: "#fff", align: "center", dropShadow: true },
    });
    title.anchor.set(0.5, 0.5);
    title.x = 512;
    title.y = 200;
    GameState.app.stage.addChild(title);

    const created: { sprite: Sprite; text: Text }[] = [];
    const cleanup = () => {
      title.destroy();
      created.forEach(({ sprite, text }) => { sprite.destroy(); text.destroy(); });
      overlay.forEach((o) => o.destroy());
    };

    options.forEach((opt, i) => {
      const [sprite, text] = createButton(312, 310 + i * 110, opt.metadata.displayName, () => {
        cleanup();
        resolve(opt.metadata.name);
      });
      GameState.app.stage.addChild(sprite);
      GameState.app.stage.addChild(text);
      created.push({ sprite, text });
    });
  });
}

// ── Main wallet type picker ────────────────────────────────────────────────
export async function showWalletPicker(): Promise<{ wallet: string; walletType: WalletType }> {
  const type = await pickWalletType();

  if (type === "evm") {
    const result = await walletLogin({ mode: WalletMode.EvmInjected });
    if (!result.success) throw new Error(`EVM wallet connection failed: ${result.errorMessage}`);
    GameState.walletObj = result.result;
    GameState.wallet = result.result.walletAddress;
    return { wallet: result.result.walletAddress, walletType: "evm" };
  }

  if (type === "cardano") {
    const injected = await allInjectedWallets();
    const cardanoWallets = injected[WalletMode.Cardano] ?? [];
    if (cardanoWallets.length === 0) {
      throw new Error("No Cardano wallet detected. Install Nami, Lace, Eternl, or another CIP-30 wallet.");
    }
    const chosen =
      cardanoWallets.length === 1
        ? cardanoWallets[0].metadata.name
        : await pickCardanoWallet(cardanoWallets);
    const result = await walletLogin({ mode: WalletMode.Cardano, preference: { name: chosen } });
    if (!result.success) throw new Error(`Cardano wallet connection failed: ${result.errorMessage}`);
    GameState.walletObj = result.result;
    GameState.wallet = result.result.walletAddress;
    return { wallet: result.result.walletAddress, walletType: "cardano" };
  }

  // Social / Biometric
  const socialWallet: Wallet = await connectSocialWallet();
  GameState.walletObj = socialWallet;
  GameState.wallet = socialWallet.walletAddress;
  return { wallet: socialWallet.walletAddress, walletType: "social" };
}

// ── Three-card type picker overlay ────────────────────────────────────────
function pickWalletType(): Promise<WalletType> {
  return new Promise((resolve) => {
    const overlay = loader(GameState.app);

    const title = new Text({
      text: "Connect Wallet",
      style: { fontFamily: "oswald", fontSize: 52, fill: "#fff", align: "center", dropShadow: true },
    });
    title.anchor.set(0.5, 0.5);
    title.x = 512;
    title.y = 180;
    GameState.app.stage.addChild(title);

    const cards: Array<{ bg: Graphics; label: Text; sub: Text }> = [];
    const created: Array<Sprite | Text | Graphics> = [title];

    const cleanup = () => {
      created.forEach((n) => n.destroy());
      overlay.forEach((o) => o.destroy());
    };

    const options: Array<{ label: string; sub: string; type: WalletType }> = [
      { label: "EVM", sub: "MetaMask, WalletConnect, etc.", type: "evm" },
      { label: "Cardano", sub: "Nami, Lace, Eternl, Flint…", type: "cardano" },
      { label: "Social / Biometric", sub: "Google Drive + passkey", type: "social" },
    ];

    options.forEach((opt, i) => {
      const cardX = 512 - 160;
      const cardY = 310 + i * 130;
      const cardW = 320;
      const cardH = 100;

      const bg = new Graphics()
        .roundRect(cardX, cardY, cardW, cardH, 12)
        .fill({ color: 0x1a1d24, alpha: 0.95 })
        .stroke({ color: 0x3a4060, width: 1.5 });
      bg.eventMode = "static";
      bg.cursor = "pointer";

      const label = new Text({
        text: opt.label,
        style: { fontFamily: "oswald", fontSize: 28, fill: "#ffffff", dropShadow: true },
      });
      label.anchor.set(0, 0.5);
      label.x = cardX + 20;
      label.y = cardY + 34;

      const sub = new Text({
        text: opt.sub,
        style: { fontFamily: "oswald", fontSize: 16, fill: "#8899bb" },
      });
      sub.anchor.set(0, 0.5);
      sub.x = cardX + 20;
      sub.y = cardY + 68;

      bg.on("pointerdown", () => {
        cleanup();
        resolve(opt.type);
      });
      bg.on("pointerover", () => bg.tint = 0xccddff);
      bg.on("pointerout", () => bg.tint = 0xffffff);

      GameState.app.stage.addChild(bg);
      GameState.app.stage.addChild(label);
      GameState.app.stage.addChild(sub);

      cards.push({ bg, label, sub });
      created.push(bg, label, sub);
    });
  });
}
