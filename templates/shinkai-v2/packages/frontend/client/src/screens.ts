import { Graphics, Sprite, Text } from "pixi.js";
import type { Input } from "@pixi/ui";
import {
  animalQuestion,
  animalTalk,
  createButton,
  createInput,
  loader,
  showKingTokens,
  showTokens,
  wait,
} from "./graphics.ts";
import { GameState } from "./game-state.ts";
import { sendTransaction } from "@effectstream/wallets";
import { paimaConfig } from "./config.ts";
import { getGame, getGameRound, getNewGame, getTokens } from "./api.ts";
import { connectWallet } from "./main.ts";

export abstract class QFTScreen {
  public abstract assets: (Sprite | Text | Input | Graphics)[];
  public abstract name: string;
  public abstract submitTalk: Sprite | Text | null;
  public abstract inputText: Input | null;
  public abstract inputBribe: Input | null;

  public updateScreen = (next: () => QFTScreen) => {
    const data = next();
    data.assets.forEach((d) => GameState.app.stage.addChild(d));
    GameState.elapsed = 0.0;
    GameState.currentScreen = data;
  };

  public abstract tick(): void;

  clickCallback(input: Input, cleanup: Function, animal: string, next: () => QFTScreen) {
    return async () => {
      if (GameState.isLoading) return;
      const value = input.value;
      if (!value) return;

      const l = loader(GameState.app);
      GameState.isLoading = true;

      await sendTransaction(
        null as any,
        ["ai", animal, GameState.gameId, value],
        paimaConfig,
        "wait-effectstream-processed",
      );

      const round = await getGameRound(GameState.gameId, animal);
      GameState.isLoading = false;

      if (!round) {
        l.forEach((o) => o.destroy());
        return;
      }

      cleanup();
      await animalTalk(GameState.app, round.answer ?? "...");
      await wait(2000);
      this.updateScreen(next);
    };
  }
}

export class MainScreen extends QFTScreen {
  private main_title: Sprite;
  public assets: (Sprite | Text | Input | Graphics)[];
  public name = "main";
  public submitTalk: Sprite | Text | null = null;
  public inputText: Input | null = null;
  public inputBribe: Input | null = null;

  constructor() {
    super();
    const bg = Sprite.from("/assets/img/castle.png");
    this.main_title = Sprite.from("/assets/img/name.png");
    this.main_title.y = -300;

    const [btn, btnText] = createButton(320, 700, "Enter the Kingdom", async () => {
      if (GameState.isLoading) return;
      const l = loader(GameState.app);
      GameState.isLoading = true;

      try {
        if (!GameState.wallet) await connectWallet();
        await sendTransaction(null as any, ["newGame"], paimaConfig, "wait-effectstream-processed");

        const game = await getNewGame(GameState.wallet);
        const tokens = await getTokens(GameState.wallet);

        if (game) {
          GameState.gameId = game.id;
          showTokens(GameState.app, tokens?.tokens ?? 0);
          showKingTokens(GameState.app, tokens?.global ?? 10000);
          this.updateScreen(() => new TigerScreen());
        }
      } finally {
        GameState.isLoading = false;
        l.forEach((o) => o.destroy());
      }
    });

    this.assets = [bg, this.main_title, btn, btnText];
  }

  public tick(): void {
    this.main_title.y = Math.min(Math.max(-300, -300.0 + GameState.elapsed), 100);
  }
}

export class TigerScreen extends QFTScreen {
  public assets: (Sprite | Text | Input | Graphics)[];
  public name = "tiger";
  public submitTalk: Sprite | Text | null = null;
  public inputText: Input | null = null;
  public inputBribe: Input | null = null;

  constructor() {
    super();
    const animal = Sprite.from("/assets/img/tiger.png");
    animal.x = 0;
    animal.y = 200;

    const input = createInput(320, 550);
    this.inputText = input;
    const [btn, btnText] = createButton(320, 400, "Speak", () => {});
    this.submitTalk = btn;

    const cleanup = () => {
      [animal, input, btn, btnText].forEach((x) => x.destroy());
    };

    btn.on("pointerdown", this.clickCallback(input, cleanup, "tiger", () => new MonkeyScreen()));

    animalQuestion(GameState.app, "Which is the best Animal of the Entire Kingdom?");
    this.assets = [animal, input, btn, btnText];
  }

  public tick(): void {}
}

export class MonkeyScreen extends QFTScreen {
  public assets: (Sprite | Text | Input | Graphics)[];
  public name = "monkey";
  public submitTalk: Sprite | Text | null = null;
  public inputText: Input | null = null;
  public inputBribe: Input | null = null;

  constructor() {
    super();
    const animal = Sprite.from("/assets/img/monkey.png");
    animal.x = 0;
    animal.y = 200;

    const input = createInput(320, 550);
    this.inputText = input;
    const [btn, btnText] = createButton(320, 400, "Speak", () => {});
    this.submitTalk = btn;

    const cleanup = () => {
      [animal, input, btn, btnText].forEach((x) => x.destroy());
    };

    btn.on("pointerdown", this.clickCallback(input, cleanup, "monkey", () => new BisonScreen()));

    animalQuestion(GameState.app, "What is most holy of all?");
    this.assets = [animal, input, btn, btnText];
  }

  public tick(): void {}
}

export class BisonScreen extends QFTScreen {
  public assets: (Sprite | Text | Input | Graphics)[];
  public name = "bison";
  public submitTalk: Sprite | Text | null = null;
  public inputText: Input | null = null;
  public inputBribe: Input | null = null;

  constructor() {
    super();
    const animal = Sprite.from("/assets/img/bison.png");
    animal.x = 0;
    animal.y = 200;

    const input = createInput(320, 550);
    this.inputText = input;
    const [btn, btnText] = createButton(320, 400, "Speak", () => {});
    this.submitTalk = btn;

    const cleanup = () => {
      [animal, input, btn, btnText].forEach((x) => x.destroy());
    };

    btn.on("pointerdown", this.clickCallback(input, cleanup, "bison", () => new PandaScreen()));

    animalQuestion(GameState.app, "What should the Kingdom do in case of war?");
    this.assets = [animal, input, btn, btnText];
  }

  public tick(): void {}
}

export class PandaScreen extends QFTScreen {
  public assets: (Sprite | Text | Input | Graphics)[];
  public name = "panda";
  public submitTalk: Sprite | Text | null = null;
  public inputText: Input | null = null;
  public inputBribe: Input | null = null;

  constructor() {
    super();
    const animal = Sprite.from("/assets/img/panda.png");
    animal.x = 0;
    animal.y = 200;

    const input = createInput(320, 550);
    this.inputText = input;
    const [btn, btnText] = createButton(320, 400, "Speak", () => {});
    this.submitTalk = btn;

    const cleanup = () => {
      [animal, input, btn, btnText].forEach((x) => x.destroy());
    };

    btn.on("pointerdown", this.clickCallback(input, cleanup, "panda", () => new EndScreen()));

    animalQuestion(GameState.app, "Why should I give you Tokens?");
    this.assets = [animal, input, btn, btnText];
  }

  public tick(): void {}
}

export class EndScreen extends QFTScreen {
  public assets: (Sprite | Text | Input | Graphics)[];
  public name = "end";
  public submitTalk: Sprite | Text | null = null;
  public inputText: Input | null = null;
  public inputBribe: Input | null = null;

  constructor() {
    super();
    const wow = Sprite.from("/assets/img/wow.png");
    wow.x = 200;
    wow.y = 300;

    (async () => {
      const game = await getGame(GameState.gameId);
      if (game?.prize != null) {
        const t = new Text({
          text: `You earned ${game.prize} tokens!`,
          style: { fontFamily: "oswald", fontSize: 48, fill: "#f1c40f", dropShadow: true },
        });
        t.anchor.set(0.5, 0.5);
        t.x = 512;
        t.y = 700;
        GameState.app.stage.addChild(t);
      }
    })();

    this.assets = [wow];
  }

  public tick(): void {}
}
