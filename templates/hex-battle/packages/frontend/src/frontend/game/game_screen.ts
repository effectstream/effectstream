import * as mw from '../../paima/middleware';
import {Tile, Game, Moves, Unit, Building, Hex} from '@hex-battle/engine';
import {GameDraw, ITEM} from './game_draw';

export class GameScreen extends GameDraw {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timer: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchtimer: any = null;

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

  last_block_height: number | null = null;
  now_block_height = -1;

  endGameWithDraw = false;

  constructor(game: Game, onChainGame: boolean) {
    super(game, onChainGame);
    this.last_block_height = this.game.startBlockheight;
  }

  isGameOver() {
    return this.game.winner || this.endGameWithDraw;
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

    if (this.onChainGame) {
      this.fetchtimer = setInterval(() => {
        if (this.isGameOver()) return;
        mw.default.getLatestProcessedBlockHeight().then(date => {
          if (date.success) {
            this.now_block_height = date.result;
          }
        });

        mw.default
          .isGameOver(this.game.lobbyId)
          .then(res => {
            if (res.success) {
              if (
                res.data.isGameOver &&
                res.data.current_round === this.game.turn &&
                !this.game.winner
              ) {
                // Lobby closed and no winner. This is a draw.
                this.endGameWithDraw = true;
              }
            }
          })
          .catch(err => {
            console.log('isGameOver', err);
          });

        mw.default
          .getMoveForRound(this.game.lobbyId, this.game.turn)
          .then(res => {
            if (res.success && res.data) {
              console.log('getMoves', res.data);
              if (this.getIsLoading()) {
                console.log('Loading: do not apply moves. Wait...');
                return;
              }
              if (res.data.round !== this.game.turn) {
                console.log('Round missmatch: do not apply');
                return;
              }

              if (this.game.moves[this.game.turn]) {
                // This happens if we have moves, but zombie kicked in first.
                // Lets undo player moves and then apply zombie.
                const currentTurnMoves = this.game.moves[this.game.turn];
                while (currentTurnMoves.actions.length) {
                  this.game.undo();
                }
              }

              const move = Moves.deserializePaima(this.game, res.data);
              this.game.initMoves(move.player);
              for (const action of move.actions) {
                switch (action.type) {
                  case 'move':
                    this.game.moves[move.turn].applyMoveUnit(this.game, action);
                    break;
                  case 'new_unit':
                    this.game.moves[move.turn].applyPlaceUnit(
                      this.game,
                      action
                    );
                    break;
                  case 'new_building':
                    this.game.moves[move.turn].applyPlaceBuilding(
                      this.game,
                      action
                    );
                    break;
                  case 'surrender':
                    this.game.moves[move.turn].applySurrender(
                      this.game,
                      action
                    );
                    break;
                  default:
                    throw new Error('Unknown action type');
                }
              }

              this.game.endTurn();
              this.last_block_height = res.data.block_height;
            }
          })
          .catch(err => {
            console.log('getMoves', err);
          });
      }, 1000);
    }
  }

  async stop() {
    this.canvas.removeEventListener('click', this.clickEventListener);
    this.canvas.removeEventListener('mousemove', this.hoverEventListener);
    this.canvas.removeEventListener('mousedown', this.mouseDownListener);
    this.canvas.removeEventListener('mouseup', this.mouseUpListener);
    this.timer && clearInterval(this.timer);
    this.fetchtimer && clearInterval(this.fetchtimer);
  }

  /// INIT AND HELPERS

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
        if (this.onChainGame) {
          console.log('SUBMIT END TURN');
          if (!this.game.moves[this.game.turn]) {
            this.setToastMessage('You have not moved yet');
            return;
          }
          this.playSound();

          this.blockedUI = true;
          const turn = this.game.turn;
          const moves = this.game.moves[this.game.turn].serializePaima();
          this.setIsLoading(true);
          mw.default
            .submitMoves(this.game.lobbyId, turn, moves)
            .then(res => {
              if (res.success) {
                console.log('Move SUBMITED', {res, moves, turn});
                this.game.endTurn();
                this.last_block_height = this.now_block_height;
              }
            })
            .catch(err => console.log(err))
            .finally(() => {
              this.setIsLoading(false);
              this.blockedUI = false;
            });
        } else {
          this.playSound();

          this.game.endTurn();
        }
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
            if (this.onChainGame) {
              this.setToastMessage(
                'Press "END TURN" to submit your winning move.'
              );
            } else {
              this.game.endTurn();
            }
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
          /** Animate move */
          // const clickFirst = this.game.map.tiles.find(t =>
          //   t.same(this.clickFirst)
          // );
          // {
          //   const gameCopy = Game.import(Game.export(this.game));
          //   const tileA = gameCopy.map.tiles.find(t => t.same(this.clickFirst));
          //   const tileB = gameCopy.map.tiles.find(t => t.same(tile));
          //   const playerC = gameCopy.players.find(p => p.id === player.id);
          //   const action = gameCopy.moveUnit(playerC!, tileA!, tileB!);
          //   const origin = Hex.qrsToXy(action.origin!, this.size);
          //   const target = Hex.qrsToXy(action.target!, this.size);
          //   this.vector = {
          //     origin,
          //     target,
          //     current: origin,
          //     step: 100,
          //     currentStep: 0,
          //   };
          // }
          // const unitStore = clickFirst!.unit;
          // clickFirst!.unit = null;
          // (async () => {
          //   while (this.vector) {
          //     await this.wait(10);
          //     if (this.vector?.currentStep >= this.vector?.step) {
          //       this.vector = null;
          //     } else {
          //       this.vector.currentStep += 10;
          //       this.vector.current = {
          //         x:
          //           this.vector.origin.x +
          //           (this.vector.target.x - this.vector.origin.x) *
          //             (this.vector.currentStep / this.vector.step),
          //         y:
          //           this.vector.origin.y +
          //           (this.vector.target.y - this.vector.origin.y) *
          //             (this.vector.currentStep / this.vector.step),
          //       };
          //       const imageCache = new ImageCache(this.game);
          //       const src = imageCache.getImageSource(unitStore!.type);

          //       this.drawImage(
          //         this.vector.current.x,
          //         this.vector.current.y,
          //         src,
          //         ''
          //       );
          //     }
          //   }
          //   clickFirst!.unit = unitStore;
          //   this.game.moveUnit(player, clickFirst!, tile);
          // })();
          this.playSound();
          this.game.moveUnit(player, this.clickFirst, tile);
          if (this.game.players.filter(p => p.alive).length === 1) {
            // this move ended the game.
            if (this.onChainGame) {
              this.setToastMessage(
                'Press "END TURN" to submit your winning move.'
              );
            } else {
              this.game.endTurn();
            }
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

  private hold_click = 0;
  private hold_time: any = null;
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
    this.events.forEach(event => {
      if (
        absMousePos.x > event.coord.x &&
        absMousePos.x < event.coord.x + event.coord.w &&
        absMousePos.y > event.coord.y &&
        absMousePos.y < event.coord.y + event.coord.h
      ) {
        event.callback();
        this.playSound();
      }
    });

    const mousePos = this.getMousePos(evt);
    // check if human player turn
    if (this.game.getCurrentPlayer().isHuman === false) return;
    const {q, r, s} = Hex.pixel_to_pointy_hex(mousePos, this.size);

    // console.log({q, r, s});

    const myTurn =
      !this.onChainGame ||
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
  DrawTurn() {
    this.ctx.font = this.font18VT323;
    this.ctx.fillStyle = 'black';
    this.ctx.textAlign = 'left';
    this.ctx.beginPath();
    this.ctx.fillText(
      `Turn ${this.game.turn}`,
      this.canvas.width - 8 * this.size,
      this.size
    );
    this.ctx.closePath();

    if (this.now_block_height > 0 && this.last_block_height) {
      const totalSeconds = 120;
      const elappsed =
        ((this.now_block_height - this.last_block_height) * mw.ENV.BLOCK_TIME) |
        0;
      const remaining = Math.max(0, totalSeconds - elappsed);
      this.ctx.beginPath();
      this.ctx.fillText(
        `${remaining}[s]`,
        this.canvas.width - 6 * this.size,
        this.size * 2
      );
      this.ctx.closePath();
    }
  }

  // MAIN DRAW FUNCTION
  events: {
    coord: {x: number; y: number; w: number; h: number};
    callback: () => void;
  }[] = [];

  setupGameOptions(optionsCoord: {x: number; y: number; w: number; h: number}) {
    this.events.push({
      coord: optionsCoord,
      callback: () => {
        (window as any).game_options_show(() => {
          const isMyTurn =
            this.game.getCurrentPlayer().wallet === this.game.localWallet;
          if (!isMyTurn) {
            this.setToastMessage("It's not your turn");
            return;
          }

          try {
            this.game.surrender(this.game.getCurrentPlayer());
            if (this.onChainGame) {
              this.blockedUI = true;
              this.setIsLoading(true);
              const turn = this.game.turn;
              const moves = this.game.moves[this.game.turn].serializePaima();
              mw.default
                .submitMoves(this.game.lobbyId, turn, moves)
                .then(res => {
                  this.setIsLoading(false);
                  this.blockedUI = false;
                  if (res.success) {
                    console.log('Move SUBMITED', {res});
                    this.game.endTurn();
                    this.last_block_height = this.now_block_height;
                  }
                })
                .catch(err => {
                  console.log(err);
                })
                .finally(() => {
                  this.blockedUI = false;
                  this.setIsLoading(false);
                });
            } else {
              this.game.endTurn();
            }
          } catch (e) {
            console.log('Cannot Surrender', e);
          }
        });
      },
    });
  }

  drawGame() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
    this.DrawPlayers();
    this.DrawItems(this.frame, this.lastItemHightLight);
    if (this.isGameOver()) {
      this.DrawWinnerOrLoser(this.game.winner, this.hold_click / 10);
    }
    const optionsCoord = this.DrawOptions();
    if (!this.events.length && optionsCoord) {
      this.setupGameOptions(optionsCoord);
    }

    this.DrawToast();
    this.DrawLoading();
  }
}
