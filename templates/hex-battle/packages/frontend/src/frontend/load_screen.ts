// image cache
import {
  BuildingType,
  Game,
  Player,
  PlayerID,
  UnitType,
} from '@hex-battle/engine';
import {ScreenUI} from './screen';
import {Colors} from './colors';
import {HexAudio} from './audio';

export class ImageCache {
  constructor(private game: Game) {}

  static images = new Map<string, any>();

  preloadImage(src: string) {
    return new Promise((resolve, reject) => {
      if (ImageCache.images.has(src)) return resolve(null);

      const img = new Image();
      img.src = src;
      img.onload = function () {
        ImageCache.images.set(src, img);
        resolve(null);
      };
      img.onerror = function (ev) {
        reject(ev);
      };
    });
  }

  getImageSource(
    unit: UnitType | BuildingType,
    playerId: PlayerID | null = null
  ): string {
    const pid = Player.getPlayerIndex(
      playerId || this.game.getCurrentPlayer().id
    );

    switch (unit) {
      case UnitType.UNIT_1:
        return `assets/m_${pid * 4 + 1}.png`;
      case UnitType.UNIT_2:
        return `assets/m_${pid * 4 + 2}.png`;
      case UnitType.UNIT_3:
        return `assets/m_${pid * 4 + 3}.png`;
      case UnitType.UNIT_4:
        return `assets/m_${pid * 4 + 4}.png`;
      case BuildingType.FARM:
        return `assets/f_${pid + 1}.png`;
      case BuildingType.BASE:
        return `assets/b_${pid + 1}.png`;
      case BuildingType.TOWER:
        return `assets/t1_${pid + 1}.png`;
      case BuildingType.TOWER2:
        return `assets/t2_${pid + 1}.png`;
      default:
        throw new Error('missing asset');
    }
  }
}

function getFontPromise(fontName: string, fontURL: string) {
  return new Promise((resolve, reject) => {
    new FontFace(fontName, `url(${fontURL})`)
      .load()
      .then(font => {
        (document.fonts as any).add(font);
        resolve(null);
      })
      .catch(err => {
        reject(err);
      });
  });
}

export function loadFont() {
  return Promise.all([
    getFontPromise(
      'Rajdhani',
      'https://fonts.cdnfonts.com/s/15366/Rajdhani-Bold.woff'
    ),
    getFontPromise(
      'VT323',
      'https://fonts.gstatic.com/s/vt323/v8/CfvjE7QXPaQqLo02SkpIgA.ttf'
    ),
    getFontPromise(
      'Electrolize',
      'https://fonts.gstatic.com/s/electrolize/v18/cIf5Ma1dtE0zSiGSiED7AUEGso5tQafB.ttf'
    ),
  ]);
}

export class LoadScreen extends ScreenUI {
  imageSize: number;
  xCenter: number;
  xImage: number;
  yImage: number;
  imageCache: ImageCache;

  constructor(private game: Game) {
    super();
    this.imageSize = 40;
    this.xCenter = this.canvas.width / 2;
    this.xImage =
      this.xCenter - (this.game.players.length / 2) * this.imageSize * 1.2;
    this.yImage = 100;
    this.imageCache = new ImageCache(this.game);
  }

  static imagesTypes = [
    UnitType.UNIT_1,
    UnitType.UNIT_2,
    UnitType.UNIT_3,
    UnitType.UNIT_4,
    BuildingType.FARM,
    BuildingType.TOWER,
    BuildingType.TOWER2,
    BuildingType.BASE,
  ];

  wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  draw = () => {
    for (const player of this.game.players) {
      this.ctx.beginPath();
      this.ctx.fillStyle = Colors.getColor(player.id);

      this.ctx.textAlign = 'left';
      this.ctx.font = '10px Electrolize';
      this.ctx.fillText(`Player ${player.id}`, this.xImage, this.yImage + 35);
      this.ctx.fillRect(
        this.xImage,
        this.yImage + this.imageSize,
        this.imageSize,
        this.imageSize * LoadScreen.imagesTypes.length * 1.25
      );
      this.ctx.closePath();
      for (const i of LoadScreen.imagesTypes) {
        const src = this.imageCache.getImageSource(i, player.id);
        this.yImage += this.imageSize * 1.2;

        if (ImageCache.images.has(src)) {
          const factor = Math.min(
            this.imageSize / ImageCache.images.get(src).width,
            this.imageSize / ImageCache.images.get(src).height
          );
          this.ctx.scale(factor, factor);

          this.ctx.drawImage(
            ImageCache.images.get(src),
            (1 / factor) * this.xImage,
            (1 / factor) * this.yImage
          );

          this.ctx.scale(1 / factor, 1 / factor);
        }
      }
      this.yImage = 100;
      this.xImage += this.imageSize * 1.2;
    }
  };

  drawText() {
    this.ctx.beginPath();
    this.ctx.font = '40px Electrolize';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Loading...', this.xCenter, 100);
    this.ctx.closePath();
  }

  async stop() {}

  async start() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawText();
    await this.imageCache.preloadImage('assets/options.png');
    await new HexAudio().load();
    for (const player of this.game.players) {
      await Promise.all(
        LoadScreen.imagesTypes.map(i =>
          this.imageCache.preloadImage(
            this.imageCache.getImageSource(i, player.id)
          )
        )
      );
      this.xImage =
        this.xCenter - (this.game.players.length / 2) * this.imageSize * 1.2;
      this.yImage = 100;
      this.draw();
    }

    // await this.wait(1000);
  }
}
