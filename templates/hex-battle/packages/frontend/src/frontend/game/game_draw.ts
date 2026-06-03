import {
  Building,
  BuildingType,
  Game,
  Hex,
  Player,
  Tile,
  Unit,
  UnitType,
  XYCoord,
} from '@hex-battle/engine';
import {ScreenUI} from '../screen';
import {DrawHex} from '../hex.draw';
import {ImageCache} from '../load_screen';
import {Colors} from '../colors';
import {AudioType, HexAudio} from '../audio';

export enum ITEM {
  UNIT_1 = 0,
  UNIT_2 = 1,
  UNIT_3 = 2,
  UNIT_4 = 3,
  FARM = 4,
  TOWER = 5,
  TOWER2 = 6,
  END_TURN = 7,
  UNDO = 8,
}

export abstract class GameDraw extends ScreenUI {
  // global scale [unitless]
  // 33 for 1920x1040
  protected readonly size = 32;

  protected font18VT323 = `${(0.9 * this.size) | 0}px VT323`;
  protected font20Electrolize = `${this.size | 0}px Electrolize`;
  protected font22Electrolize = `${(1.1 * this.size) | 0}px Electrolize`;
  protected font30Electrolize = `${(1.5 * this.size) | 0}px Electrolize`;
  protected font40Electrolize = `${(2.0 * this.size) | 0}px Electrolize`;
  protected font34Electrolize = `${(1.7 * this.size) | 0}px Electrolize`;
  protected font55Electrolize = `${(2.8 * this.size) | 0}px Electrolize`;
  // default image size
  protected readonly imageSize = (this.size * 1.6) | 0;

  // 1 wave per second
  readonly cos = new Array(60).fill(0).map((_, i) => {
    const x = Math.cos((i / 60) * 2 * Math.PI);
    return x;
  });

  readonly sin = new Array(60).fill(0).map((_, i) => {
    const x = Math.sin((i / 60) * 2 * Math.PI);
    return x;
  });

  // HUD offset
  protected readonly HUD_height = this.size * 4.6;
  // HUD tiles
  protected itemTiles: Tile[] = [];

  // Game end with draw (e.g., too many timeouts)
  protected endGameWithDraw = false;

  // global grid offset
  private offset_x = 0;
  private offset_y = 0;

  // store if current player has more moves.
  protected playerHasMoves = true;

  constructor(
    public game: Game,
    public onChainGame: boolean
  ) {
    super();
    this.initXY();
    this.initItems();
  }

  protected isGameOver() {
    return this.game.winner || this.endGameWithDraw;
  }

  // Init game variables.
  private async initXY() {
    let minX = Number.MAX_SAFE_INTEGER;
    let maxX = Number.MIN_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxY = Number.MIN_SAFE_INTEGER;

    this.game.map.tiles.forEach(tile => {
      const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    this.offset_x = this.canvas.width / 2 - (maxX + minX) / 2;
    this.offset_y = -minY + this.size * 2; // canvas.height / 2 - (minY + maxY) / 2;
  }

  // INIT HUD wit items tiles.
  private initItems() {
    if (this.itemTiles.length > 0) throw new Error('items already init');

    // helpers to create tiles in position
    // This is not very consistent.
    const y_ = this.canvas.height - this.HUD_height - this.offset_y;
    const x_ = this.canvas.width / 2 - 240 - this.offset_x;
    const itemPos = Hex.pixel_to_pointy_hex({x: x_, y: y_}, this.size);
    console.log({itemPos});
    const qrs = Tile.addVectors([
      itemPos,
      // Hex.pixel_to_pointy_hex({x:600, y:500}, this.size),
      // {q: -6, r: 14, s: -8},
      // {q: 2, r: 10, s: -12}
      // {q: 0, r: this.game.map.maxR, s: -this.game.map.maxR},
      // Tile.dirToVec(Tile.directionVector(5, 2)),
    ]);

    const buildVector = (dir: number[]) => {
      return Tile.vecToDir(
        Tile.addVectors([
          qrs,
          ...dir.map(d => Tile.dirToVec(Tile.directionVector(d, 1))),
        ])
      );
    };

    const north_east = 1;
    const south_east = 0;
    // const north_west = 3;
    // const south_west = 4;
    const south = 5;
    // const north = 2;
    const down = (i: number) => {
      return new Array(i).fill(0).map(() => south);
    };
    const move = (i: number) => {
      return new Array(i)
        .fill(0)
        .map((_, i) => (i % 2 === 0 ? north_east : south_east));
    };
    for (let i = 0; i < 9; i += 1) {
      switch (i) {
        case ITEM.UNIT_1:
          {
            const t = new Tile(...buildVector(move(2)));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.unit = new Unit(null as any, UnitType.UNIT_1, 'DUMMY_1');
            this.itemTiles.push(t);
          }
          break;
        case ITEM.UNIT_2:
          {
            const t = new Tile(...buildVector([...move(3), ...down(1)]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.unit = new Unit(null as any, UnitType.UNIT_2, 'DUMMY_2');
            this.itemTiles.push(t);
          }
          break;
        case ITEM.UNIT_3:
          {
            const t = new Tile(...buildVector(move(4)));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.unit = new Unit(null as any, UnitType.UNIT_3, 'DUMMY_3');
            this.itemTiles.push(t);
          }
          break;
        case ITEM.UNIT_4:
          {
            const t = new Tile(...buildVector([...move(5), ...down(1)]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.unit = new Unit(null as any, UnitType.UNIT_4, 'DUMMY_4');
            this.itemTiles.push(t);
          }
          break;
        case ITEM.FARM:
          {
            const t = new Tile(...buildVector([...move(7), ...down(1)]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.building = new Building(null as any, BuildingType.FARM);
            this.itemTiles.push(t);
          }
          break;
        case ITEM.TOWER:
          {
            const t = new Tile(...buildVector([...move(8)]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.building = new Building(null as any, BuildingType.TOWER);
            this.itemTiles.push(t);
          }
          break;
        case ITEM.TOWER2:
          {
            const t = new Tile(...buildVector([...move(9), ...down(1)]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.building = new Building(null as any, BuildingType.TOWER2);
            this.itemTiles.push(t);
          }
          break;
        case ITEM.END_TURN:
          {
            const t = new Tile(...buildVector([...move(11), ...down(1)]));
            this.itemTiles.push(t);
          }
          break;
        case ITEM.UNDO:
          {
            const t = new Tile(...buildVector([...move(12)]));
            this.itemTiles.push(t);
          }
          break;
        default:
          throw new Error('Missing definition');
      }
    }
  }

  protected playSound() {
    new HexAudio().play(AudioType.click);
  }

  protected getMousePos(event: MouseEvent, withOffset = true) {
    // Map cursor → intrinsic canvas coords from the canvas's ACTUAL rendered
    // rect. This is scaling-agnostic (CSS `zoom`, `transform: scale`, responsive
    // sizing) and browser-agnostic — unlike the old `clientX / zoom - rect.left`,
    // which is only correct at zoom === 1 and drifts as the UI shrinks below
    // 1920px (the sub-1440px click-misalignment bug).
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);
    return {
      x:
        (event.clientX - rect.left) * scaleX -
        (withOffset ? this.offset_x : 0),
      y:
        (event.clientY - rect.top) * scaleY -
        (withOffset ? this.offset_y : 0),
    };
  }

  // DRAW player info
  protected DrawPlayers() {
    for (let position = 0; position < this.game.players.length; position++) {
      const player = this.game.players[position];
      if (!player) throw new Error('Player not found');

      this.ctx.beginPath();
      this.ctx.fillStyle = Colors.getColor(player.id);

      this.ctx.font = this.font18VT323;
      this.ctx.textAlign = 'left';

      this.ctx.fillText(
        this.getDisplayName(player).substring(0, 24), // this is not a monospace font - so we need to calculate lenght
        (this.size / 2) | 0,
        this.size + position * ((this.size * 1.1) | 0)
      );

      if (!player.alive) {
        this.ctx.fillText(
          '💀',
          9 * this.size,
          this.size + position * ((this.size * 1.1) | 0)
        );
      } else {
        const gpr = player.goldPerRound(this.game.map);
        const goldText = `${player.gold} (${gpr >= 0 ? '+' + gpr : gpr})`;
        this.ctx.fillText(
          ` Gold ${goldText}`,
          9 * this.size,
          this.size + position * ((this.size * 1.1) | 0)
        );
      }
    }
  }

  private getDisplayName(player: Player) {
    return this.onChainGame ? player.name : player.isHuman ? 'Player' : '[AI]';
  }

  //  // Alert your turn
  //  // TODO toast message is over items.
  //   private lastAlert = -1;
  //   alertNewRound() {
  //     if (this.lastAlert === this.game.turn) return;
  //     if (this.isGameOver()) return;
  //     this.lastAlert = this.game.turn;
  //     this.setToastMessage('Your turn!');
  //   }

  private lastYourTurnAudio = -1;

  protected DrawHUDBackgroundAndText(
    itemClick: Tile | null,
    lastItemHightLight: Tile | null
  ) {
    const player = this.game.getCurrentPlayer();
    const lineWidth = (0.35 * this.size) | 0;
    const HUD_top = this.canvas.height - this.HUD_height;

    // Background Area
    this.ctx.beginPath();
    this.ctx.fillStyle = '#3c6382';
    this.ctx.fillRect(0, HUD_top, this.canvas.width, this.HUD_height);
    this.ctx.closePath();

    // Main HUD Area
    this.ctx.beginPath();
    this.ctx.fillStyle = Colors.getColor(player.id);
    this.ctx.fillRect(
      lineWidth,
      HUD_top + lineWidth,
      this.canvas.width - 2 * lineWidth,
      this.HUD_height - 2 * lineWidth
    );
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.font = this.font22Electrolize;
    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'left';

    if (player.wallet === this.game.localWallet) {
      // this.alertNewRound();
      if (this.lastYourTurnAudio !== this.game.turn) {
        this.lastYourTurnAudio = this.game.turn;
        new HexAudio().play(AudioType.turn);
      }
      this.ctx.fillText(
        'Your turn',
        this.size,
        (HUD_top + 1.4 * this.size) | 0
      );
    } else {
      this.ctx.fillText(
        "Opponent's turn",
        this.size,
        (HUD_top + 1.4 * this.size) | 0
      );
    }

    this.ctx.fillText(
      this.getDisplayName(player),
      this.size,
      (HUD_top + 2.65 * this.size) | 0
    );
    this.ctx.font = this.font20Electrolize;
    const gpr = player.goldPerRound(this.game.map);
    this.ctx.fillText(
      `Gold ${player.gold} (${gpr >= 0 ? '+' : ''}${gpr})`,
      this.size,
      (HUD_top + 3.9 * this.size) | 0
    );

    this.ctx.closePath();

    if (itemClick || lastItemHightLight) {
      let text: string[] = ['', ''];
      if (itemClick) {
        text = this.getItemText(itemClick);
      } else if (lastItemHightLight) {
        text = this.getItemText(lastItemHightLight);
      }
      this.ctx.beginPath();
      this.ctx.fillStyle = 'white';
      const fontSize = Math.min(
        this.size * 2,
        ((this.size * 3) / text.length) | 0
      );
      this.ctx.font = `${fontSize}px Electrolize`;
      for (let i = 0; i < text.length; i += 1) {
        this.ctx.fillText(
          text[i] || '',
          (0.7 * this.canvas.width) | 0,
          HUD_top + fontSize * 1.5 + fontSize * i * 1.1,
          15 * this.size
        );
      }
    }
  }

  private getItemText(item: Tile): string[] {
    if (item.unit) {
      const u = Unit.getNameAndDescription(item.unit.type);
      return [
        `${u.name} ${Unit.getPrice(item.unit.type)} gold`,
        `Maintenance ${Unit.getMaintenancePrice(item.unit.type)} gold per turn`,
        u.description,
        `Power Level ${Unit.getPowerLevel(item.unit.type)}`,
      ];
    }
    if (item.building) {
      const b = Building.getNameAndDescription(item.building.type);
      const maintenance = Building.getMaintenancePrice(item.building.type);
      return [
        `${b.name} ${Building.getPrice(item.building.type)} gold`,
        maintenance ? `Maintenance ${maintenance} gold per turn` : '',
        b.description,
        `Power Level ${Building.getPowerLevel(item.building.type)}`,
      ];
    }
    if (item === this.itemTiles[ITEM.END_TURN]) {
      return [
        'END TURN',
        '',
        'After ending your turn',
        'you cannot undo moves.',
      ];
    }
    if (item === this.itemTiles[ITEM.UNDO]) {
      return [
        'UNDO LAST MOVE',
        '',
        'During your turn, you can undo',
        'as many times you want.',
      ];
    }
    throw new Error('Missing name');
  }

  // iterations of hexes to draw
  private endFrame = 0;
  private endTiles: (XYCoord & {color: string})[] = [];

  protected DrawWinnerOrLoser(winner: Player | null, barPercent: number) {
    this.ctx.beginPath();
    this.ctx.globalAlpha = 0.7;
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.globalAlpha = 1;
    this.ctx.closePath();

    if (this.endFrame < 600) {
      let insert = false;
      while (!insert) {
        const x_ = (Math.random() * this.canvas.width) | 0;
        const y_ = (Math.random() * this.canvas.height) | 0;
        const qrs = Hex.pixel_to_pointy_hex({x: x_, y: y_}, this.size);
        const xy = {
          ...Hex.qrsToXy(qrs, this.size),
          color: Colors.colors[(Math.random() * Colors.colors.length) | 0],
        };
        if (!this.endTiles.find(t => t.x === xy.x && t.y === xy.y)) {
          insert = true;
          this.endTiles.push(xy);
        }
      }
      this.endFrame += 1;
    }

    this.ctx.lineWidth = 0;
    this.ctx.fillStyle = 'black';
    this.ctx.globalAlpha = 0.7;
    this.endTiles.forEach(t => {
      // const xy = Hex.pointy_hex_to_pixel(t, this.size);
      this.ctx.beginPath();
      this.ctx.fillStyle = t.color;
      DrawHex.drawHexagon(this.ctx, t.x, t.y, this.size);
      // this.ctx.fill();

      // this.ctx.fillStyle = 'black';
      // DrawHex.draw3DHexagon(this.ctx, t.x, t.y, this.size, 10, 10);
      this.ctx.fill();
      this.ctx.closePath();
    });
    this.ctx.globalAlpha = 1;
    this.ctx.lineWidth = 1;

    // Background Area
    const lineWidth = 6;
    this.ctx.beginPath();
    this.ctx.fillStyle = '#3c6382';
    this.ctx.fillRect(
      this.HUD_height / 2 - lineWidth,
      this.canvas.height / 2 - this.HUD_height / 2 - lineWidth,
      this.canvas.width - 2 * this.HUD_height + lineWidth * 2,
      this.HUD_height + lineWidth * 2
    );
    this.ctx.closePath();

    this.ctx.beginPath();
    if (winner) {
      this.ctx.fillStyle = Colors.getColor(winner.id);
    } else {
      this.ctx.fillStyle = '#222';
    }
    this.ctx.fillRect(
      this.HUD_height / 2,
      this.canvas.height / 2 - this.HUD_height / 2,
      this.canvas.width - 2 * this.HUD_height,
      this.HUD_height
    );
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.globalAlpha = 0.3;
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(
      this.HUD_height / 2,
      this.canvas.height / 2 - this.HUD_height / 2,
      barPercent * (this.canvas.width - 2 * this.HUD_height),
      this.HUD_height
    );
    this.ctx.globalAlpha = 1;
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.font = this.font40Electrolize;
    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'center';

    if (winner) {
      const player = this.game.players.find(p => p.wallet === winner.wallet)!;
      this.ctx.fillText(
        `${this.getDisplayName(player)} wins!`,
        this.canvas.width / 2,
        this.canvas.height / 2
      );
    } else {
      this.ctx.fillText(
        'Game ended in draw.',
        this.canvas.width / 2,
        this.canvas.height / 2
      );
    }
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.font = this.font20Electrolize;
    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      'Hold click to exit',
      this.canvas.width / 2,
      (this.canvas.height / 2 + 1.5 * this.size) | 0
    );
    this.ctx.closePath();
  }

  // DRAW single image with default size
  private DrawImage(x: number, y: number, src: string, text: string) {
    if (!ImageCache.images.has(src)) {
      throw new Error('Preload images first: ' + src);
    } else {
      const factor = Math.min(
        this.imageSize / ImageCache.images.get(src).width,
        this.imageSize / ImageCache.images.get(src).height
      );
      this.ctx.scale(factor, factor);
      this.ctx.drawImage(
        ImageCache.images.get(src),
        (1 / factor) * (x + this.offset_x) -
          ImageCache.images.get(src).width / 2,
        (1 / factor) * (y + this.offset_y) -
          ImageCache.images.get(src).height / 2
      );

      if (text) {
        this.ctx.beginPath();
        this.ctx.globalAlpha = 0.8;
        this.ctx.arc(
          (1 / factor) * (x + this.offset_x) +
            ImageCache.images.get(src).width / 2,
          (1 / factor) * (y + this.offset_y) +
            ImageCache.images.get(src).width / 2 -
            10 / factor,
          (this.size * 1.2) | 0,
          0,
          2 * Math.PI
        );

        this.ctx.fillStyle = 'white';
        this.ctx.fill();
        this.ctx.globalAlpha = 1;

        this.ctx.closePath();
        this.ctx.font = this.font34Electrolize;
        this.ctx.fillStyle = 'black';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
          text,
          (1 / factor) * (x + this.offset_x) +
            ImageCache.images.get(src).width / 2,
          (1 / factor) * (y + this.offset_y) +
            ImageCache.images.get(src).width / 2 -
            6 / factor
        );
      }

      this.ctx.scale(1 / factor, 1 / factor);
    }
  }

  // DRAW item tiles
  protected DrawItems(frame: number, lastItemHightLight: Tile | null) {
    const player = this.game.getCurrentPlayer();
    // OUTLINE
    for (const tile of this.itemTiles) {
      const draw =
        tile.building ||
        tile.unit ||
        (!tile.building &&
          !tile.unit &&
          this.game.localWallet === player.wallet);

      if (draw) {
        const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#3c6382';
        this.ctx.lineWidth = (this.size * 0.125) | 0;
        DrawHex.drawHexagon(
          this.ctx,
          x + this.offset_x,
          y + this.offset_y,
          this.size * 1.3
        );
        this.ctx.fillStyle = '#3c6382';
        this.ctx.fill();
        this.ctx.closePath();
      }
    }
    this.ctx.strokeStyle = 'black';

    // ITEM TILES
    for (const tile of this.itemTiles) {
      const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);
      this.ctx.beginPath();
      this.ctx.lineWidth = (this.size * 0.125) | 0;
      this.ctx.fillStyle = 'white';

      if (tile === this.itemTiles[ITEM.END_TURN]) {
        // do not draw
      } else if (tile === this.itemTiles[ITEM.UNDO]) {
        // do not draw
      } else {
        DrawHex.drawHexagon(
          this.ctx,
          x + this.offset_x,
          y + this.offset_y,
          this.size
        );
      }
      this.ctx.fill();
      this.ctx.closePath();
    }

    if (lastItemHightLight) {
      if (lastItemHightLight.same(this.itemTiles[ITEM.END_TURN])) {
        // do not draw
      } else if (lastItemHightLight.same(this.itemTiles[ITEM.UNDO])) {
        // do not draw
      } else {
        // console.log('draw item highlight', itemHighlight);
        this.ctx.beginPath();
        this.ctx.lineWidth = (this.size * 0.375) | 0;
        this.ctx.fillStyle = Colors.getColor(player.id);
        const [x, y] = Hex.pointy_hex_to_pixel(lastItemHightLight, this.size);
        DrawHex.drawHexagon(
          this.ctx,
          x + this.offset_x,
          y + this.offset_y,
          this.size
        );
        this.ctx.fill();
        this.ctx.closePath();
      }
    }

    const imageCache = new ImageCache(this.game);
    for (const tile of this.itemTiles) {
      const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);
      if (tile.unit) {
        const src = imageCache.getImageSource(tile.unit.type);
        const hasGold = player.gold >= Unit.getPrice(tile.unit.type);
        if (!hasGold) this.ctx.filter = 'grayscale(1)';
        this.DrawImage(x, y, src, '');
        if (!hasGold) this.ctx.filter = 'none';
      }
      if (tile.building) {
        const src = imageCache.getImageSource(tile.building.type);
        const hasGold = player.gold >= Building.getPrice(tile.building.type);
        if (!hasGold) this.ctx.filter = 'grayscale(1)';
        this.DrawImage(x, y, src, '');
        if (!hasGold) this.ctx.filter = 'none';
      }
    }

    const myTurn = player.wallet === this.game.localWallet;

    if (myTurn) {
      // UNDO
      const tile = this.itemTiles[ITEM.UNDO];
      const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);

      this.ctx.beginPath();

      if (lastItemHightLight?.same(this.itemTiles[ITEM.UNDO])) {
        this.ctx.lineWidth = (this.size * 0.375) | 0;
      } else {
        this.ctx.lineWidth = (this.size * 0.125) | 0;
      }
      if (this.game.moves[this.game.turn]?.actions.length > 0) {
        this.ctx.fillStyle = '#fad390';
      } else {
        this.ctx.fillStyle = '#ccc';
      }
      DrawHex.drawHexagon(
        this.ctx,
        x + this.offset_x,
        y + this.offset_y,
        this.size
      );
      this.ctx.fill();
      this.ctx.closePath();

      this.ctx.beginPath();
      const fontSize = this.size / 2;
      this.ctx.font = `${fontSize}px Electrolize`;
      this.ctx.fillStyle = 'black';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        'UNDO',
        x + this.offset_x,
        y + this.offset_y + fontSize / 2
      );
      this.ctx.closePath();
    }
    // END TURN
    if (myTurn) {
      const c = this.playerHasMoves ? 0 : this.cos[frame];
      const tile = this.itemTiles[ITEM.END_TURN];
      const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);
      this.ctx.beginPath();

      if (lastItemHightLight?.same(this.itemTiles[ITEM.END_TURN])) {
        this.ctx.lineWidth = (this.size * 0.375) | 0;
      } else {
        this.ctx.lineWidth = (this.size * 0.125) | 0;
      }

      this.ctx.fillStyle = '#78e08f';
      //   this.ctx.lineWidth = (size * 0.125) | 0;
      DrawHex.drawHexagon(
        this.ctx,
        x + this.offset_x,
        y + this.offset_y,
        this.size + c * 2
      );
      this.ctx.fill();
      this.ctx.closePath();

      this.ctx.beginPath();
      const fontSize = c + this.size / 2;
      this.ctx.font = `${fontSize}px Electrolize`;
      this.ctx.fillStyle = 'black';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        'END',
        x + this.offset_x,
        y + this.offset_y - fontSize * 0.2
      );
      this.ctx.fillText(
        'TURN',
        x + this.offset_x,
        y + this.offset_y + fontSize * 1.0
      );
      this.ctx.closePath();
    }
  }

  imageCache = new ImageCache(this.game);

  // DRAW specific tile
  private DrawTile(
    frame: number,
    tile: Tile,
    highlight: boolean,
    itemClick: Tile | null,
    itemNearbyTiles: Tile[],
    shade = 0 /* -100, 100 */
  ) {
    this.ctx.beginPath();
    const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);
    if (highlight) {
      this.ctx.lineWidth = (this.size * 0.375) | 0;
    } else {
      this.ctx.lineWidth = (this.size * 0.125) | 0;
    }
    DrawHex.drawHexagon(
      this.ctx,
      x + this.offset_x,
      y + this.offset_y,
      this.size
    );

    if (tile.owner) {
      if (shade !== 0) {
        const altColor =
          tile.building && tile.building.type === BuildingType.BASE
            ? Colors.shadeColor(Colors.getColor(tile.owner.id), shade + 20)
            : Colors.shadeColor(Colors.getColor(tile.owner.id), shade);

        this.ctx.fillStyle = altColor;
      } else {
        if (tile.building && tile.building.type === BuildingType.BASE) {
          this.ctx.fillStyle = Colors.shadeColor(
            Colors.getColor(tile.owner.id),
            20
          );
        } else {
          this.ctx.fillStyle = Colors.getColor(tile.owner.id);
        }
      }
    } else {
      if (shade) {
        this.ctx.fillStyle = '#bbbbbb';
      } else {
        this.ctx.fillStyle = '#eeeeee';
      }
    }
    this.ctx.fill();
    this.ctx.closePath();
  }

  private DrawTileImage(
    frame: number,
    tile: Tile,
    highlight: boolean,
    itemClick: Tile | null,
    itemNearbyTiles: Tile[]
  ) {
    const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);
    this.ctx.beginPath();
    if (highlight && itemClick && itemNearbyTiles.find(t => t.same(tile))) {
      if (itemClick.unit) {
        this.DrawImage(
          x,
          y,
          this.imageCache.getImageSource(itemClick.unit.type),
          `${Unit.getPowerLevel(itemClick.unit.type)}`
        );
      }
      if (itemClick.building) {
        this.DrawImage(
          x,
          y,
          this.imageCache.getImageSource(itemClick.building.type),
          `${Building.getPowerLevel(itemClick.building.type)}`
        );
      }
    }

    if (tile.building && tile.owner) {
      this.DrawImage(
        x,
        y,
        this.imageCache.getImageSource(tile.building.type, tile.owner.id),
        `${Building.getPowerLevel(tile.building.type)}`
      );
    }
    if (tile.unit && tile.owner) {
      const wiggle =
        tile.unit.canMove && tile.owner.id === this.game.getCurrentPlayerId();
      const c = wiggle ? this.cos[frame] * 2 : 0;
      const s = wiggle ? this.sin[frame] * 2 : 0;
      this.DrawImage(
        x - s,
        y + c,
        this.imageCache.getImageSource(tile.unit.type, tile.owner.id),
        `${Unit.getPowerLevel(tile.unit.type)}`
      );
    }

    this.ctx.closePath();
  }

  // DRAW effect undermap
  protected Draw3DUnderMap() {
    const elevation = [8, 8];

    // Draw under tiles effect

    this.ctx.fillStyle = '#0a3d62';
    for (const tile of this.game.map.tiles) {
      this.ctx.beginPath();

      //   this.ctx.lineWidth = 0;
      const [x, y] = Hex.pointy_hex_to_pixel(tile, this.size);

      DrawHex.draw3DHexagon(
        this.ctx,
        x + this.offset_x,
        y + this.offset_y,
        this.size,
        elevation[0],
        elevation[1]
      );
      this.ctx.fill();
      this.ctx.closePath();
    }
  }

  protected DrawOptions() {
    this.ctx.beginPath();
    const src = 'assets/options.png';
    if (!ImageCache.images.has(src)) {
      throw new Error('Preload images first: ' + src);
    }
    const coord = {
      x: this.canvas.width - 3 * this.size,
      y: this.size,
      w: this.size * 2,
      h: this.size * 2,
    };
    this.ctx.drawImage(
      ImageCache.images.get(src),
      coord.x,
      coord.y,
      coord.w,
      coord.h
    );
    this.ctx.closePath();
    return coord;
  }

  private DrawMapUnits(
    frame: number,
    itemClick: Tile | null,
    clickFirst: Tile | null,
    lastHighlight: Tile | null,
    itemNearbyTiles: Tile[]
  ) {
    // DrawTileImage()
    for (const tile of this.game.map.tiles) {
      if (clickFirst && clickFirst === tile) {
        // do nothing
      } else if (lastHighlight && lastHighlight === tile) {
        // draw at end.
      } else {
        this.DrawTileImage(frame, tile, false, itemClick, itemNearbyTiles);
      }
    }
    if (clickFirst)
      this.DrawTileImage(frame, clickFirst, true, itemClick, itemNearbyTiles);
    if (lastHighlight)
      this.DrawTileImage(
        frame,
        lastHighlight,
        true,
        itemClick,
        itemNearbyTiles
      );
  }

  // DRAW game map
  protected DrawMap(
    frame: number,
    itemClick: Tile | null,
    clickFirst: Tile | null,
    lastHighlight: Tile | null,
    getMovingDistance: Tile[],
    itemNearbyTiles: Tile[]
  ) {
    // Draw tiles
    for (const tile of this.game.map.tiles) {
      if (clickFirst && clickFirst === tile) {
        // do nothing
      } else if (lastHighlight && lastHighlight === tile) {
        // draw at end.
      } else {
        let inMovementDistance = false;
        if (clickFirst) {
          if (getMovingDistance.length) {
            if (getMovingDistance.find(t => t.same(tile))) {
              inMovementDistance = true;
            }
          }
        }
        if (itemClick) {
          if (itemNearbyTiles.length) {
            if (itemNearbyTiles.find(t => t.same(tile))) {
              inMovementDistance = true;
            }
          }
        }
        this.DrawTile(
          frame,
          tile,
          false,
          itemClick,
          itemNearbyTiles,
          inMovementDistance ? 25 : 0
        );
      }
    }
    if (clickFirst)
      this.DrawTile(frame, clickFirst, true, itemClick, itemNearbyTiles, 40);
    if (lastHighlight)
      this.DrawTile(frame, lastHighlight, true, itemClick, itemNearbyTiles, 80);
    this.DrawMapUnits(
      frame,
      itemClick,
      clickFirst,
      lastHighlight,
      itemNearbyTiles
    );
  }
}
