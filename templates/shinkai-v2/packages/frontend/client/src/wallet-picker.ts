import { Graphics, Text } from "pixi.js";
import { allInjectedWallets, walletLogin, WalletMode } from "@effectstream/wallets";
import type { Wallet } from "@effectstream/wallets";
import { GameState } from "./game-state.ts";
import { loader } from "./graphics.ts";
import { connectSocialWallet } from "./social-wallet-provider.ts";
import { paimaConfig } from "./config.ts";

type WalletType = "evm" | "cardano" | "social";

interface PickerEntry {
  displayName: string;
  sub: string;
  badgeLabel: string;
  badgeColor: number;
  walletType: WalletType;
  walletName?: string; // undefined for social
}

// ── Main entry point ──────────────────────────────────────────────────────
export async function showWalletPicker(): Promise<{ wallet: string; walletType: WalletType }> {
  const injected = await allInjectedWallets();
  const evmWallets = injected[WalletMode.EvmInjected] ?? [];
  const cardanoWallets = injected[WalletMode.Cardano] ?? [];

  const entries: PickerEntry[] = [
    ...evmWallets.map((w) => ({
      displayName: w.metadata.displayName,
      sub: "EVM",
      badgeLabel: "EVM",
      badgeColor: 0x3b82f6,
      walletType: "evm" as WalletType,
      walletName: w.metadata.name,
    })),
    ...cardanoWallets.map((w) => ({
      displayName: w.metadata.displayName,
      sub: "Cardano",
      badgeLabel: "ADA",
      badgeColor: 0xf97316,
      walletType: "cardano" as WalletType,
      walletName: w.metadata.name,
    })),
    {
      displayName: "Social / Biometric",
      sub: "Google Drive + passkey",
      badgeLabel: "KEY",
      badgeColor: 0x06b6d4,
      walletType: "social",
    },
  ];

  const chosen = await pickFromList(entries);

  if (chosen.walletType === "evm") {
    const result = await walletLogin({
      mode: WalletMode.EvmInjected,
      preferBatchedMode: true,
      chain: paimaConfig.effectstreamL2Chain,
      preference: { name: chosen.walletName! },
    });
    if (!result.success) throw new Error(`EVM wallet failed: ${result.errorMessage}`);
    GameState.walletObj = result.result;
    GameState.wallet = result.result.walletAddress;
    return { wallet: result.result.walletAddress, walletType: "evm" };
  }

  if (chosen.walletType === "cardano") {
    const result = await walletLogin({
      mode: WalletMode.Cardano,
      preference: { name: chosen.walletName! },
    });
    if (!result.success) throw new Error(`Cardano wallet failed: ${result.errorMessage}`);
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

// ── PixiJS list picker ────────────────────────────────────────────────────
function pickFromList(entries: PickerEntry[]): Promise<PickerEntry> {
  return new Promise((resolve) => {
    const overlay = loader(GameState.app);
    const created: (Graphics | Text)[] = [];

    const title = new Text({
      text: "Connect Wallet",
      style: {
        fontFamily: "oswald",
        fontSize: 46,
        fill: "#ffffff",
        align: "center",
        dropShadow: true,
      },
    });
    title.anchor.set(0.5, 0.5);
    title.x = 512;
    title.y = 150;
    GameState.app.stage.addChild(title);
    created.push(title);

    if (entries.length === 1) {
      // Only Social — add a "no injected wallets" note
      const note = new Text({
        text: "No EVM or Cardano wallets detected",
        style: { fontFamily: "oswald", fontSize: 18, fill: "#8899bb" },
      });
      note.anchor.set(0.5, 0.5);
      note.x = 512;
      note.y = 210;
      GameState.app.stage.addChild(note);
      created.push(note);
    }

    const cleanup = () => {
      created.forEach((n) => n.destroy());
      overlay.forEach((o) => o.destroy());
    };

    const cardW = 380;
    const cardH = 72;
    const cardX = 512 - cardW / 2;
    const startY = entries.length <= 4 ? 230 : 190;
    const gap = Math.min(90, (820 - startY) / entries.length);

    entries.forEach((entry, i) => {
      const cardY = startY + i * gap;

      // Card background
      const bg = new Graphics()
        .roundRect(cardX, cardY, cardW, cardH, 10)
        .fill({ color: 0x1a1d28, alpha: 0.95 })
        .stroke({ color: 0x2d3452, width: 1.5 });
      bg.eventMode = "static";
      bg.cursor = "pointer";

      // Colored badge pill
      const badgeW = 52;
      const badge = new Graphics()
        .roundRect(cardX + 14, cardY + cardH / 2 - 12, badgeW, 24, 6)
        .fill({ color: entry.badgeColor, alpha: 0.9 });

      const badgeText = new Text({
        text: entry.badgeLabel,
        style: { fontFamily: "oswald", fontSize: 13, fill: "#ffffff", fontWeight: "bold" },
      });
      badgeText.anchor.set(0.5, 0.5);
      badgeText.x = cardX + 14 + badgeW / 2;
      badgeText.y = cardY + cardH / 2;

      // Wallet name
      const nameText = new Text({
        text: entry.displayName,
        style: { fontFamily: "oswald", fontSize: 24, fill: "#ffffff", dropShadow: true },
      });
      nameText.anchor.set(0, 0.5);
      nameText.x = cardX + 80;
      nameText.y = cardY + cardH / 2 - 8;

      // Sub-label
      const subText = new Text({
        text: entry.sub,
        style: { fontFamily: "oswald", fontSize: 14, fill: "#6677aa" },
      });
      subText.anchor.set(0, 0.5);
      subText.x = cardX + 80;
      subText.y = cardY + cardH / 2 + 16;

      bg.on("pointerdown", () => {
        cleanup();
        resolve(entry);
      });
      bg.on("pointerover", () => {
        bg.clear()
          .roundRect(cardX, cardY, cardW, cardH, 10)
          .fill({ color: 0x252840, alpha: 0.98 })
          .stroke({ color: entry.badgeColor, width: 1.5 });
      });
      bg.on("pointerout", () => {
        bg.clear()
          .roundRect(cardX, cardY, cardW, cardH, 10)
          .fill({ color: 0x1a1d28, alpha: 0.95 })
          .stroke({ color: 0x2d3452, width: 1.5 });
      });

      GameState.app.stage.addChild(bg);
      GameState.app.stage.addChild(badge);
      GameState.app.stage.addChild(badgeText);
      GameState.app.stage.addChild(nameText);
      GameState.app.stage.addChild(subText);
      created.push(bg, badge, badgeText, nameText, subText);
    });
  });
}
