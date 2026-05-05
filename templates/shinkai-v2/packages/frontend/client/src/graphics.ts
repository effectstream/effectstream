import { Input } from "@pixi/ui";
import type { Application, FederatedPointerEvent } from "pixi.js";
import { Sprite, Text, Graphics } from "pixi.js";

export const wait = (n: number) => new Promise((resolve) => setTimeout(resolve, n));

export const loader = (app: Application) => {
  const graphics = new Graphics().rect(0, 0, 1024, 1024).fill({ color: 0x000000, alpha: 0.6 });
  app.stage.addChild(graphics);
  return [graphics];
};

export const animalQuestion = async (app: Application, text: string) => {
  await wait(300);
  const graphics = new Graphics()
    .rect(200, 40, 1024 - 400, 120)
    .fill({ color: 0x000000, alpha: 0.6 });
  app.stage.addChild(graphics);

  const words = text.split(/\s+/);
  const wordWrapWidth = 500;
  let last: Text | null = null;
  for (let i = 0; i < words.length; i += 1) {
    const t = new Text({
      text: words.slice(0, i + 1).join(" "),
      style: {
        align: "center",
        wordWrap: true,
        breakWords: true,
        fill: "#fff",
        wordWrapWidth,
        fontFamily: "oswald",
        fontSize: 40,
        dropShadow: true,
      },
    });
    t.anchor.set(0.5, 0.5);
    t.x = 1024 / 2;
    t.y = 100;
    if (last) last.destroy();
    app.stage.addChild(t);
    last = t;
    await wait(200);
  }
};

export const animalTalk = async (app: Application, text: string) => {
  const words = text.split(/\s+/);
  const wordWrapWidth = 500;
  for (let i = 0; i < words.length; i += 1) {
    const wx = words.slice(0, i + 1);
    const t = new Text({
      text: wx.join(" "),
      style: {
        wordWrap: true,
        breakWords: true,
        fill: "#fff",
        wordWrapWidth,
        fontFamily: "oswald",
        fontSize: 30,
        dropShadow: true,
      },
    });
    t.anchor.set(0, 0);
    t.x = (1024 - wordWrapWidth) / 2;
    t.y = 300;
    app.stage.addChild(t);
    if (wx[wx.length - 1].match(/^\*.*\*$/)) await wait(1000);
    await wait(200);
  }
};

export const showKingTokens = (app: Application, tokens: number) => {
  const t = new Text({
    text: `The Panda King is Giving away\n${tokens} Tokens!`,
    style: { fontSize: 40, fontFamily: "oswald", dropShadow: true, fill: "#f1c40f", align: "right" },
  });
  t.anchor.set(1, 0);
  t.x = 1000;
  t.y = 40;
  app.stage.addChild(t);
};

export const showTokens = (app: Application, tokens: number) => {
  const wow = Sprite.from("/assets/img/token.png");
  wow.x = 40;
  wow.y = 784;
  app.stage.addChild(wow);

  const t = new Text({
    text: `${tokens}\nTokens`,
    style: { fontFamily: "oswald", fontSize: 60, dropShadow: true, fill: "#f1c40f" },
  });
  t.anchor.set(0, 0);
  t.x = 240;
  t.y = 810;
  app.stage.addChild(t);
};

export const createButton = (
  x: number,
  y: number,
  text: string,
  callback: (event: FederatedPointerEvent) => void,
): [Sprite, Text] => {
  const sprite = Sprite.from("/assets/img/button/b1.png");
  sprite.eventMode = "static";
  sprite.cursor = "pointer";
  sprite.on("pointerdown", callback);
  sprite.x = x;
  sprite.y = y;

  const t = new Text({
    text,
    style: { align: "center", fontFamily: "oswald", fontSize: 30 },
  });
  t.anchor.set(0.5, 0.5);
  t.x = x + 399 / 2;
  t.y = y + 97 / 2;

  return [sprite, t];
};

export const createInput = (x: number, y: number) => {
  const input = new Input({
    bg: Sprite.from("/assets/img/button/b2.png"),
    textStyle: { wordWrap: true, wordWrapWidth: 400, fontFamily: "oswald", fontSize: 24 },
    placeholder: "Write your response...",
    padding: { top: 11, right: 11, bottom: 11, left: 11 },
  });
  input.x = x;
  input.y = y;
  return input;
};
