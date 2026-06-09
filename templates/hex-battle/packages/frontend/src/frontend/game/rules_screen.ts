import {
  Tile,
  Game,
  Unit,
  Building,
  Hex,
  UnitType,
  BuildingType,
  Player,
  GameMap,
} from '@hex-battle/engine';
import {GameDraw, ITEM} from './game_draw';

export class RulesScreen extends GameDraw {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timer: any = null;

  blockedUI = false;

  lastHighlightUpdate = new Date().getTime();

  // app 60 logical frames per second.
  frame = 0;

  // store if tile was clicked
  clickFirst: Tile | null = null;
  // store if item was clicked
  itemClick: Tile | null = null;
  // highlight tiles where item can be placed
  itemNearbyTiles: Tile[] = [];
  // highlight tiles where unit can move
  getMovingDistance: Tile[] = [];
  // store tile that is highlighted
  lastHighlight: Tile | null = null;
  // store item that is highlighted
  lastItemHightLight: Tile | null = null;

  constructor(game: Game) {
    super(game, false);
  }

  async start() {
    // add event listener for clicks
    this.canvas.addEventListener('click', this.clickEventListener);

    // add event listener for mouse moves on canvas
    this.canvas.addEventListener('mousemove', this.hoverEventListener);

    // add event lister mouse-down and mouse-up;
    this.canvas.addEventListener('mousedown', this.mouseDownListener);
    this.canvas.addEventListener('mouseup', this.mouseUpListener);

    // update UI 30 times per second.
    this.timer = setInterval(
      () => {
        this.frame = (this.frame + 1) % 60; // this should go 0-60; but might be less.
        if (this.frame % 2 === 0) {
          this.playerHasMoves = this.game.currentPlayerHasMoves();
          this.drawGame();
        }
      },
      (1000 / 60) | 0
    );
  }

  async stop() {
    this.canvas.removeEventListener('click', this.clickEventListener);
    this.canvas.removeEventListener('mousemove', this.hoverEventListener);
    this.canvas.removeEventListener('mousedown', this.mouseDownListener);
    this.canvas.removeEventListener('mouseup', this.mouseUpListener);
    this.timer && clearInterval(this.timer);
  }

  // user clicked on hud item
  clickOnItem(itemTile: Tile) {
    console.log('CLICK ITEM', itemTile);
    this.resetClick();
    try {
      const player = this.game.getCurrentPlayer();
      if (itemTile.unit) {
        if (player.gold < Unit.getPrice(itemTile.unit.type)) {
          throw new Error('No money');
        }
        const mainenance = Unit.getMaintenancePrice(itemTile.unit.type);
        if (player.goldPerRound(this.game.map) + mainenance < 0) {
          this.setToastMessage('Gold per round cannot be negative.');
          throw new Error('Not enough gold per round');
        }
        this.itemClick = itemTile;
        this.itemNearbyTiles = this.game.getNewUnitTiles(
          player,
          itemTile.unit.type
        );
        this.playSound();
      } else if (itemTile.building) {
        if (player.gold < Building.getPrice(itemTile.building.type)) {
          throw new Error('No money');
        }
        const maintenance = Building.getMaintenancePrice(
          itemTile.building.type
        );
        if (
          maintenance &&
          player.goldPerRound(this.game.map) + maintenance < 0
        ) {
          this.setToastMessage('Gold per round cannot be negative.');
          throw new Error('Not enough gold per round');
        }
        this.itemClick = itemTile;
        this.itemNearbyTiles = this.game.getBuildingTiles(player);
        this.playSound();
      } else if (itemTile === this.itemTiles[ITEM.END_TURN]) {
        this.playSound();

        this.game.endTurn();
        this.blockedUI = true;
        setTimeout(() => {
          if (!this.isGameOver()) {
            this.game.endTurn();
          }
          this.blockedUI = false;
        }, 2000);
      } else if (itemTile === this.itemTiles[ITEM.UNDO]) {
        console.log('UNDO');
        if (this.game.moves[this.game.turn]?.actions?.length) {
          this.game.undo();
          this.playSound();
        }
      } else {
        throw new Error('unknown item');
      }
    } catch (e) {
      console.log('ITEM ERROR', e);
      this.resetClick();
    }
  }

  // reset all clicks and click side effects
  resetClick() {
    this.clickFirst = null;
    this.itemClick = null;
    this.getMovingDistance = [];
    this.itemNearbyTiles = [];
    this.lastHighlight = null;
    this.lastItemHightLight = null;
  }

  /* Animation */
  // wait = (n: number) => new Promise(resolve => setTimeout(resolve, n));
  // vector: {
  //   origin: {x: number; y: number};
  //   target: {x: number; y: number};
  //   current: {x: number; y: number};
  //   step: number;
  //   currentStep: number;
  // } | null = null;

  // user clicked on map tile
  clickOnTile(tile: Tile) {
    const player = this.game.getCurrentPlayer();
    try {
      console.log('CLICK TILE', tile);
      // has clicked on item before
      if (this.itemClick) {
        if (this.itemClick.unit) {
          this.playSound();
          this.game.placeUnit(player, tile, this.itemClick.unit.type);
          if (this.game.players.filter(p => p.alive).length === 1) {
            // this move ended the game.
            this.game.endTurn();
          }
        } else if (this.itemClick.building) {
          this.playSound();
          this.game.placeBuilding(player, tile, this.itemClick.building.type);
        } else {
          throw new Error('unknown item');
        }

        this.resetClick();
        return;
      }

      // has clicked on a valid-unit tile before
      if (this.clickFirst) {
        try {
          this.playSound();
          this.game.moveUnit(player, this.clickFirst, tile);
          if (this.game.players.filter(p => p.alive).length === 1) {
            // this move ended the game.
            this.game.endTurn();
          }
        } catch (e) {
          console.log(e);
        }
        this.resetClick();
        return;
      }

      // is first click on map.
      if (tile.unit && tile.unit.canMove && tile.owner?.id === player.id) {
        this.clickFirst = tile;
        this.getMovingDistance = this.game.getUnitMovement(this.clickFirst);
        this.playSound();
        return;
      }
      // clicked on non-game-element
      this.resetClick();
    } catch (e) {
      console.log('TILE ERROR', e);
      this.resetClick();
    }
  }

  hoverEventListener = (evt: MouseEvent) => {
    if (this.isGameOver()) {
      // game finished;
      return;
    }
    const now = new Date().getTime();
    // refresh max 60fps
    if (now - this.lastHighlightUpdate < 16) {
      // console.log('skip');
      return;
    }

    this.lastHighlightUpdate = now;
    const mousePos = this.getMousePos(evt);

    const {q, r, s} = Hex.pixel_to_pointy_hex(mousePos, this.size);

    const itemHighlight = this.itemTiles.find(t => t.same({q, r, s}));
    if (itemHighlight) {
      this.lastHighlight = null;
      this.lastItemHightLight = itemHighlight;
      return;
    }

    const tileHighlight = this.game.map.tiles.find(t => t.same({q, r, s}));
    if (tileHighlight) {
      this.lastHighlight = tileHighlight;
      this.lastItemHightLight = null;
      return;
    }

    this.lastHighlight = null;
    this.lastItemHightLight = null;
  };

  hold_click = 0;
  hold_time: any = null;
  mouseDownListener = (evt: MouseEvent) => {
    if (this.isGameOver()) {
      const addHold = () => {
        const mouse_xy = this.getMousePos(evt, false);

        const x = this.HUD_height / 2;
        const y = this.canvas.height / 2 - this.HUD_height / 2;
        const w = this.canvas.width - 2 * this.HUD_height;
        const h = this.HUD_height;

        if (
          mouse_xy.x > x &&
          mouse_xy.x < x + w &&
          mouse_xy.y > y &&
          mouse_xy.y < y + h
        ) {
          if (this.hold_click < 10) {
            this.hold_click += 1;
            this.hold_time = setTimeout(addHold, 20);
          } else {
            window.location.replace('/');
          }
        }
      };

      clearTimeout(this.hold_time);
      this.hold_time = setTimeout(addHold, 20);
    }
  };

  mouseUpListener = (evt: MouseEvent) => {
    if (this.isGameOver() && (this.hold_time || this.hold_click)) {
      this.hold_click = 0;
      clearTimeout(this.hold_time);
    }
  };

  clickEventListener = (evt: MouseEvent) => {
    if (this.isGameOver()) {
      return;
    }

    const absMousePos = this.getMousePos(evt, false);
    this.buttonEvents.forEach(e => {
      if (
        absMousePos.x > e.coord.x &&
        absMousePos.x < e.coord.x + e.coord.width &&
        absMousePos.y > e.coord.y &&
        absMousePos.y < e.coord.y + e.coord.height
      ) {
        e.trigger();
        this.playSound();
      }
    });

    const mousePos = this.getMousePos(evt);
    // check if human player turn
    if (this.game.getCurrentPlayer().isHuman === false) return;
    const {q, r, s} = Hex.pixel_to_pointy_hex(mousePos, this.size);

    // console.log({q, r, s});

    const myTurn =
      this.game.getCurrentPlayer().wallet === this.game.localWallet;

    if (myTurn && !this.blockedUI) {
      const itemTile = this.itemTiles.find(t => t.same({q, r, s}));
      if (itemTile) {
        this.clickOnItem(itemTile);
        return;
      }

      const tile = this.game.map.tiles.find(t => t.same({q, r, s}));
      if (tile) {
        this.clickOnTile(tile);
        return;
      }
    }

    // clicked on non-game-element
    this.resetClick();
  };

  // DRAW turn text.
  protected DrawTurn() {
    this.ctx.font = '20px VT323';
    this.ctx.fillStyle = 'black';
    this.ctx.beginPath();
    this.ctx.fillText(`Turn ${this.game.turn}`, 1100, 20);
    this.ctx.closePath();
  }

  // MAIN DRAW FUNCTION
  drawGame() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.DrawPlayers();
    this.DrawTurn();
    this.DrawHUDBackgroundAndText(this.itemClick, this.lastItemHightLight);
    this.Draw3DUnderMap();
    this.DrawMap(
      this.frame,
      this.itemClick,
      this.clickFirst,
      this.lastHighlight,
      this.getMovingDistance,
      this.itemNearbyTiles
    );
    this.DrawItems(this.frame, this.lastItemHightLight);
    if (this.isGameOver()) {
      this.DrawWinnerOrLoser(this.game.winner, this.hold_click / 10);
    }
    this.DrawToast();
    this.DrawLoading();

    if (!this.isGameOver()) {
      this.DrawHelp();
      this.DrawButtons();
    }
  }

  DrawButtons() {
    const e1 = this.DrawButton(
      'HELP',
      this.canvas.width - this.size * 5,
      this.size * 10
    );
    const e2 = this.DrawButton(
      'EXIT',
      this.canvas.width - this.size * 5,
      this.size * 14
    );
    if (!this.buttonEvents.length) {
      this.buttonEvents.push({
        coord: e1,
        trigger: () => {
          (window as any).help_show();
        },
      });
      this.buttonEvents.push({
        coord: e2,
        trigger: () => {
          window.location.replace('/');
        },
      });
    }
  }

  buttonEvents: {
    coord: {x: number; y: number; width: number; height: number};
    trigger: () => void;
  }[] = [];

  help(text: string, x: number, y: number, height: number) {
    this.ctx.lineWidth = 1;
    this.ctx.font = this.font20Electrolize;
    const textMetrics = this.ctx.measureText(text);

    this.ctx.beginPath();
    this.ctx.strokeStyle = '#34495e';
    this.ctx.fillStyle = '#f39c12';

    this.ctx.rect(x, y, textMetrics.width + this.size, height);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#34495e';

    this.ctx.fillText(
      text,
      (x + (textMetrics.width / 2 + 10)) | 0,
      (y + (height / 2 + this.size / 3)) | 0,
      textMetrics.width
    );
    this.ctx.closePath();
  }

  DrawHelp() {
    const myUnits = this.game.map.tiles.filter(
      t => t.unit && t.unit.player.wallet === this.game.localWallet
    );
    const height = (2.25 * this.size) | 0;
    if (this.itemClick?.unit) {
      this.help(
        'Click to place your new unit ↑',
        this.canvas.width / 2 - 2 * this.size,
        this.canvas.height -
          this.HUD_height -
          ((1.75 * this.size) | 0) -
          height,
        height
      );
    } else if (this.itemClick?.building) {
      this.help(
        'Click to place your building ↑',
        this.canvas.width / 2 - 2 * this.size,
        this.canvas.height -
          this.HUD_height -
          ((1.75 * this.size) | 0) -
          height,
        height
      );
    } else if (this.clickFirst?.unit) {
      this.help(
        "Try to reach the enemy's base (in light blue) ↑",
        this.canvas.width / 2 - 2 * this.size,
        this.canvas.height -
          this.HUD_height -
          ((1.75 * this.size) | 0) -
          height,
        height
      );
    } else if (!myUnits.length) {
      this.help(
        'Select units below ↓ and place them in the map above ↑',
        this.canvas.width / 2 - 13 * this.size,
        this.canvas.height -
          this.HUD_height -
          ((1.75 * this.size) | 0) -
          height,
        height
      );
    } else if (myUnits.find(t => t.unit?.canMove)) {
      this.help(
        'Click on your units to move them →',
        20,
        this.canvas.height / 2 - 2 * this.size,
        height
      );
      this.help(
        'Select and place new units or buildings ↓',
        this.canvas.width / 2 - 10 * this.size,
        this.canvas.height -
          this.HUD_height -
          ((1.75 * this.size) | 0) -
          height,
        height
      );
      if (this.game.turn > 0) {
        this.help(
          '← The number in each unit shows its Power.',
          this.canvas.width - 22 * this.size,
          this.canvas.height / 2,
          height
        );
        this.help(
          '← Units can only destroy or get near units with less Power.',
          this.canvas.width - 27 * this.size,
          this.canvas.height / 2 + 3 * this.size,
          height
        );
      }
    } else {
      this.help(
        'Press End Turn ↓',
        this.canvas.width / 2,
        this.canvas.height -
          this.HUD_height -
          ((1.75 * this.size) | 0) -
          height,
        height
      );
    }
  }

  DrawButton(
    text: string,
    x: number,
    y: number
  ): {x: number; y: number; width: number; height: number} {
    this.ctx.textAlign = 'center';
    this.ctx.font = this.font30Electrolize;
    const textMetrics = this.ctx.measureText(text);
    // console.log(textMetrics);
    const offset = 8;
    this.ctx.beginPath();
    this.ctx.fillStyle = '#34495e'; // asphault
    //'#27ae60'; // green

    const w = Math.max(
      5 * this.size,
      Math.abs(textMetrics.actualBoundingBoxLeft) +
        Math.abs(textMetrics.actualBoundingBoxRight) +
        2 * offset
    );
    const h = Math.max(
      (2.5 * this.size) | 0,
      Math.abs(textMetrics.actualBoundingBoxAscent) +
        Math.abs(textMetrics.actualBoundingBoxDescent) +
        2 * offset
    );
    const x_ = x - offset - w / 2;
    const y_ = y - textMetrics.actualBoundingBoxAscent - offset;
    this.ctx.roundRect(x_, y_, w, h, 6);
    this.ctx.fill();
    this.ctx.closePath();

    this.ctx.beginPath();
    // this.ctx.stroke();
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#ecf0f1';
    this.ctx.fillText(text, x_ + w / 2, y + h / 6);
    this.ctx.closePath();
    return {x: x_, y: y_, width: w, height: h};
  }

  static Setup(): Game {
    const localWallet = 'ME';
    const aiWallet = 'AI';
    const playerA = new Player('A', 100, localWallet);
    const playerB = new Player('B', 100, aiWallet);
    playerB.isHuman = false;
    const tiles: Tile[] = [];
    for (let q = -5; q < 5; q++) {
      for (let r = -4 - q; r < 4 - q; r++) {
        const tile = new Tile(q, r, -(q + r));
        tiles.push(tile);
      }
    }

    const markHex = (player: Player, q: number, r: number) => {
      const center = tiles.find(t => t.same(new Tile(q, r, -(q + r))));
      if (!center) throw new Error('Center not found 3');
      center.owner = player;
      for (let d = 0; d < 6; d++) {
        const t = tiles.find(t => t.same(Tile.BuildTileFrom(center, d, 1)));
        if (!t) throw new Error('Tile not found');
        t.owner = player;
      }
    };
    const buildDist = (
      player: Player,
      q: number,
      r: number,
      dir: number,
      dist: number,
      build_type: BuildingType
    ) => {
      const center = tiles.find(t => t.same(new Tile(q, r, -(q + r))));
      if (!center) throw new Error('Center not found 1');
      const t = tiles.find(t => t.same(Tile.BuildTileFrom(center, dir, dist)));
      if (!t) throw new Error('Tile not found');
      t.owner = player;
      t.building = new Building(player, build_type);
      return t;
    };
    const unitDist = (
      player: Player,
      q: number,
      r: number,
      dir: number,
      dist: number,
      unit_type: UnitType
    ) => {
      const center = tiles.find(t => t.same(new Tile(q, r, -(q + r))));
      if (!center) throw new Error('Center not found 2');
      const t = tiles.find(t => t.same(Tile.BuildTileFrom(center, dir, dist)));
      if (!t) throw new Error('Tile not found');
      t.owner = player;
      t.unit = new Unit(
        player,
        unit_type,
        Unit.generateUnitId(0, t.getCoordinates())
      );
      return t;
    };

    {
      markHex(playerA, -3, 3);
      const base = buildDist(playerA, -3, 3, 0, 0, BuildingType.BASE);
      markHex(playerA, base.q, base.r);
    }
    {
      /* TRAINING */

      markHex(playerB, 1, -2);
      const base2 = buildDist(playerB, 1, -2, 0, 1, BuildingType.BASE);
      markHex(playerB, base2.q, base2.r);
      const unitA1 = unitDist(playerB, base2.q, base2.r, 4, 2, UnitType.UNIT_1);
      unitDist(playerB, unitA1.q, unitA1.r, 5, 1, UnitType.UNIT_1);

      const unitB1 = unitDist(playerB, base2.q, base2.r, 5, 2, UnitType.UNIT_3);
      markHex(playerB, unitB1.q, unitB1.r);

      const farm = buildDist(playerB, 1, -2, 3, 1, BuildingType.FARM);
      // const farm2 = buildDist(playerB, 1, -2, 4, 2, BuildingType.FARM);
      // buildDist(playerB, farm2.q, farm2.r, 5, 4, BuildingType.TOWER2);

      const tower = buildDist(
        playerB,
        farm.q,
        farm.r,
        2,
        1,
        BuildingType.TOWER
      );
      markHex(playerB, tower.q, tower.r);

      // unitDist(playerB, 1, -2, 2, 2, UnitType.UNIT_2);
    }
    return new Game(
      'RULES',
      new GameMap(tiles),
      [playerA, playerB],
      localWallet,
      0
    );
  }
}
