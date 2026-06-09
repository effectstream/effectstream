import {UnitType, BuildingType, AIPlayer, Hex, Name} from '@hex-battle/engine';
import * as mw from '../paima/middleware';
import {RandomGame} from '../random-game';
import {BackgroundScreen} from './background_screen';
import {GameScreen} from './game/game_screen';
import {ImageCache, LoadScreen} from './load_screen';
import {VERSION} from '../version';
import {RulesScreen} from './game/rules_screen';
import {DrawHex} from './hex.draw';
import {Colors} from './colors';
import * as walletStore from '../wallet/wallet_store';
import {ensureConnected} from '../wallet/connect_widget';

export class LobbyScreen extends BackgroundScreen {
  drawTimer: any = null;
  walletAddress: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private events: {
    coord: {x: number; y: number; width: number; height: number};
    cmd: string;
  }[] = [];

  readonly size = 36;

  constructor() {
    super('full');
  }

  async start() {
    // Reflect the connected wallet (restored on boot) and keep it in sync — the
    // chip/name regenerate whenever the user connects/disconnects via the widget.
    this.walletAddress = walletStore.getAddress();
    this.unsubscribe = walletStore.subscribe(() => {
      this.walletAddress = walletStore.getAddress();
      this.playerName = '';
      this.playerShort = '';
    });
    this.setEventListeners();
    this.startDraw();
  }

  async stop() {
    clearInterval(this.drawTimer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.canvas.removeEventListener('mousemove', this.mouse_hover_event);
    this.canvas.removeEventListener('click', this.mouse_click_event);
  }

  getMousePos(event: any) {
    // Scaling-agnostic cursor → canvas mapping (see game_draw.ts getMousePos).
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  startDraw() {
    this.drawTimer = setInterval(() => this.Draw(), 33);
  }

  font30Electrolize = `${(this.size * 1.5) | 0}px Electrolize`;
  DrawButton(
    text: string,
    code: string,
    x: number,
    y: number
  ): {x: number; y: number; width: number; height: number} {
    this.ctx.textAlign = 'center';
    this.ctx.font = this.font30Electrolize;
    const textMetrics = this.ctx.measureText(text);
    // console.log(textMetrics);
    const offset = (this.size / 2) | 0;
    this.ctx.beginPath();
    if (this.hoverButton && this.hoverButton.cmd === code) {
      this.ctx.fillStyle = '#4b6584'; // green
    } else {
      this.ctx.fillStyle = '#34495e'; // asphault
    }
    //'#27ae60'; // green

    const w = Math.max(
      this.size * 12,
      Math.abs(textMetrics.actualBoundingBoxLeft) +
        Math.abs(textMetrics.actualBoundingBoxRight) +
        2 * offset
    );
    const h = Math.max(
      this.size * 3,
      Math.abs(textMetrics.actualBoundingBoxAscent) +
        Math.abs(textMetrics.actualBoundingBoxDescent) +
        2 * offset
    );
    const x_ = x - w / 2;
    const y_ = y - h / 2;
    this.ctx.roundRect(x_, y_, w, h, (this.size / 3) | 0);
    this.ctx.fill();
    this.ctx.closePath();

    this.ctx.beginPath();
    // this.ctx.stroke();
    this.ctx.fillStyle = '#ecf0f1';
    this.ctx.fillText(text, x, (y + this.size * 0.4) | 0);
    this.ctx.closePath();
    return {x: x_, y: y_, width: w, height: h};
  }

  isInButton(
    x: number,
    y: number,
    coord: {x: number; y: number; width: number; height: number}
  ) {
    if (
      x > coord.x &&
      x < coord.x + coord.width &&
      y > coord.y &&
      y < coord.y + coord.height
    ) {
      return true;
    }
    return false;
  }

  DrawVersion() {
    this.ctx.textAlign = 'right';
    this.ctx.font = ((this.size * 0.6) | 0) + 'px Electrolize';
    this.ctx.fillStyle = '#333';
    this.ctx.fillText(VERSION, this.canvas.width - 40, this.canvas.height - 20);
  }

  hoverButton: {
    coord: {x: number; y: number; width: number; height: number};
    cmd: string;
  } | null = null;

  DrawButtons() {
    const buttonMargin = this.size * 5;
    const a = this.DrawButton(
      'Join Lobby',
      'JOIN',
      this.canvas.width * 0.2,
      this.canvas.height * 0.5 - buttonMargin
    );
    const b = this.DrawButton(
      'Create Lobby',
      'CREATE',
      this.canvas.width * 0.2,
      this.canvas.height * 0.5
    );
    const d = this.DrawButton(
      'Rejoin Game',
      'REJOIN',
      this.canvas.width * 0.2,
      this.canvas.height * 0.5 + buttonMargin
    );
    const c = this.DrawButton(
      'Practice Offline',
      'PRACTICE',
      this.canvas.width * 0.8,
      this.canvas.height * 0.5
    );
    const e = this.DrawButton(
      'Leaderboard',
      'LEADERBOARD',
      this.canvas.width * 0.8,
      this.canvas.height * 0.5 + buttonMargin
    );
    const f = this.DrawButton(
      'Tutorial',
      'TUTORIAL',
      this.canvas.width * 0.8,
      this.canvas.height * 0.5 - buttonMargin
    );

    if (!this.events.length) {
      this.events.push({coord: a, cmd: 'JOIN'});
      this.events.push({coord: b, cmd: 'CREATE'});
      this.events.push({coord: c, cmd: 'PRACTICE'});
      this.events.push({coord: d, cmd: 'REJOIN'});
      this.events.push({coord: e, cmd: 'LEADERBOARD'});
      this.events.push({coord: f, cmd: 'TUTORIAL'});
    }
  }

  imageCache = new ImageCache(null as any);
  logoSize = [935, 1022];
  DrawLogo() {
    // const src = 'assets/hexlands.png';
    {
      this.ctx.globalAlpha = 0.3;
      this.ctx.beginPath();
      this.ctx.strokeStyle = 'white';
      this.ctx.lineWidth = this.size / 5;
      const logoSize = (this.size * 3.2) | 0;
      const hexes = 4;
      const offset = (Math.cos(Math.PI / 6) * logoSize * (hexes - 1)) | 0;
      DrawHex.longHexagon(
        this.ctx,
        this.canvas.width / 2 - offset,
        this.size * 4.2, // this.canvas.height / 2,
        logoSize,
        hexes
      );
      this.ctx.fillStyle = 'black';
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.closePath();
      this.ctx.globalAlpha = 1;
    }

    {
      this.ctx.beginPath();
      this.ctx.strokeStyle = Colors.colorDark;
      this.ctx.lineWidth = this.size / 5;
      const logoSize = (this.size * 3.0) | 0;
      const hexes = 4;
      const offset = (Math.cos(Math.PI / 6) * logoSize * (hexes - 1)) | 0;
      DrawHex.longHexagon(
        this.ctx,
        this.canvas.width / 2 - offset,
        this.size * 4, // this.canvas.height / 2,
        logoSize,
        hexes
      );
      this.ctx.fillStyle = '#fff';
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.closePath();
    }

    const fontSize = this.size * 2;
    this.ctx.beginPath();
    this.ctx.fillStyle = Colors.colorDark;
    this.ctx.textAlign = 'center';
    this.ctx.font = fontSize + 'px Rajdhani';
    const store = (this.ctx as any).letterSpacing;
    (this.ctx as any).letterSpacing = ((this.size * 1.3) | 0) + 'px';
    this.ctx.fillText(
      'HEXLANDS',
      this.canvas.width / 2 + this.size * 0.65,
      this.size * 4 + this.size * 0.7
    );
    (this.ctx as any).letterSpacing = store;

    this.ctx.closePath();
  }

  Draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.DrawBackground();
    this.DrawVersion();
    this.DrawButtons();
    this.DrawLogo();
    this.DrawName();
    this.DrawToast();
    this.DrawLoading();
  }

  private playerName = '';
  private playerShort = '';
  DrawName() {
    if (this.walletAddress && !this.playerName) {
      this.playerName = Name.generateName(this.walletAddress);
      this.playerShort = Name.shortWallet(this.walletAddress);
    }
    this.ctx.beginPath();
    this.ctx.textAlign = 'left';
    this.ctx.font = this.size + 'px Electrolize';
    this.ctx.fillStyle = '#fff';
    const welcome = this.playerName
      ? `Welcome ${this.playerName} (${this.playerShort})`
      : 'Not Connected';
    this.ctx.fillText(welcome, 21, this.canvas.height - 19);
    this.ctx.fillStyle = '#333';
    this.ctx.fillText(welcome, 20, this.canvas.height - 20);
    this.ctx.closePath();
  }

  getMyWallet(callback: () => void) {
    // Already connected? proceed. Otherwise open the global connect widget and
    // continue once a wallet (real or random browser wallet) is connected.
    if (walletStore.isConnected()) {
      this.walletAddress = walletStore.getAddress();
      return callback();
    }
    ensureConnected()
      .then(() => {
        this.walletAddress = walletStore.getAddress();
        this.setToastMessage('Wallet Connected!');
        callback();
      })
      .catch(e => {
        console.log(e);
        this.setToastMessage('Could not connect wallet.');
      });
    return null;
  }

  cmd_rejoin = () => {
    if (this.getIsLoading()) return;
    this.setIsLoading(true);
    mw.default
      .getMyGames()
      .then(games => {
        if (!games.success) throw new Error('failed to get games');
        // games.data = [{ lobby_id, lobby_state, current_round, num_of_players, lobby_creator }]
        (window as any).rejoin_lobby_show(games.data, (id: string) => {
          this.stop();
          // go to pregame_screen — identity comes from the connected wallet, not the URL
          window.location.replace(`/?lobby=${id}`);
        });
      })
      .finally(() => {
        this.setIsLoading(false);
      });
  };

  cmd_join = () => {
    if (this.getIsLoading()) return;
    this.setIsLoading(true);
    mw.default
      .getOpenLobbies()
      .then(lobbies => {
        if (!lobbies.success) throw new Error('failed to get lobbies');
        const joinableLobbies = lobbies.data || [];
        if (!joinableLobbies.length) console.log('No lobbies');

        (window as any).join_lobby_show(
          joinableLobbies.filter(
            (j: {lobby_creator: any}) => j.lobby_creator !== this.walletAddress
          ),
          (id: string) => {
            if (this.getIsLoading()) return;
            this.setIsLoading(true);
            mw.default
              .joinLobby(id)
              .then(res => {
                if (res.success) {
                  this.stop();
                  // go to pregame_screen — identity is the connected wallet
                  window.location.replace(`/?lobby=${id}`);
                }
              })
              .finally(() => {
                this.setIsLoading(false);
              });
          }
        );
      })
      .finally(() => {
        this.setIsLoading(false);
      });
  };

  cmd_create = () => {
    if (this.getIsLoading()) return;
    (window as any).new_game_options_show(
      (options: {
        number_of_players: string;
        units: string;
        gold: string;
        map_size: 'small' | 'medium' | 'large';
      }) => {
        // We will only keep the map from this.
        const game = new RandomGame(
          'DUMMY-GAME',
          'DUMMY-WALLET',
          parseInt(options.number_of_players, 10),
          0,
          options.map_size,
          Array(parseInt(options.units, 10)).fill(UnitType.UNIT_1),
          [BuildingType.BASE],
          Math.min(parseInt(options.units, 10) + 2, 4),
          parseInt(options.gold, 10),
          0.24
        );

        // eslint-disable-next-line no-async-promise-executor
        const mapCoords = game.map.tiles.map(t => t.getCoordinates());
        const numOfPlayers = parseInt(options.number_of_players, 10);
        const units = Array(parseInt(options.units, 10))
          .fill(UnitType.UNIT_1)
          .join('');
        const buildings = [BuildingType.BASE].join('');
        const gold = parseInt(options.gold, 10);
        const initTiles = Math.min(parseInt(options.units, 10) + 2, 4);
        const map = mapCoords.map(({q, r, s}) => `${q}#${r}`);

        if (this.getIsLoading()) return;
        this.setIsLoading(true);
        mw.default
          .createLobby(numOfPlayers, units, buildings, gold, initTiles, map)
          .then(response => {
            if (response.success) {
              this.stop();
              const lobby = (response.data as any).lobby_id;
              // go to prescreen — identity is the connected wallet
              window.location.replace(`/?lobby=${lobby}`);
            }
          })
          .finally(() => {
            this.setIsLoading(false);
          });
      }
    );
  };

  cmd_practice = () => {
    if (this.getIsLoading()) return;
    (window as any).practice_options_show(
      (options: {
        number_of_players: string;
        units: string;
        gold: string;
        map_size: 'small' | 'medium' | 'large';
      }) => {
        const game = new RandomGame(
          'PRACTICE',
          'OFFLINE',
          1,
          parseInt(options.number_of_players, 10),
          options.map_size,
          Array(parseInt(options.units, 10)).fill(UnitType.UNIT_1),
          [BuildingType.BASE],
          Math.min(parseInt(options.units, 10) + 2, 4),
          parseInt(options.gold, 10),
          0.24
        );

        this.stop();

        new LoadScreen(game).start().then(_ => {
          new GameScreen(game, false).start();

          // Launch game if first turn is not human.
          if (game.turn === 0) {
            const player = game.getCurrentPlayer();
            if (player instanceof AIPlayer) {
              setTimeout(() => player.randomMove(game), 1000);
            }
          }
        });
      }
    );
  };

  cmd_leaderboard = () => {
    if (this.getIsLoading()) return;
    this.setIsLoading(true);
    mw.default
      .getLeaderBoard(this.walletAddress || null, 'wins')
      .then((res: any) => {
        if (res.success) {
          const players = res.data;
          players.forEach((p: any) => (p.name = Name.generateName(p.wallet)));
          (window as any).leaderboard_show(players);
        }
      })
      .finally(() => {
        this.setIsLoading(false);
      });
  };

  cmd_tutorial = () => {
    if (this.getIsLoading()) return;
    const game = RulesScreen.Setup();
    this.stop();
    new LoadScreen(game).start().then(_ => {
      new RulesScreen(game).start();
    });
  };

  mouse_click_event = (evt: Event) => {
    const mousePos = this.getMousePos(evt);
    const trigger = this.events.find(e =>
      this.isInButton(mousePos.x, mousePos.y, e.coord)
    );
    if (trigger) {
      switch (trigger.cmd) {
        case 'REJOIN':
          this.getMyWallet(this.cmd_rejoin);
          break;

        case 'JOIN':
          this.getMyWallet(this.cmd_join);
          break;

        case 'CREATE':
          this.getMyWallet(this.cmd_create);
          break;

        case 'PRACTICE': {
          this.cmd_practice();
          break;
        }

        case 'LEADERBOARD': {
          this.getMyWallet(this.cmd_leaderboard);
          break;
        }

        case 'TUTORIAL': {
          this.cmd_tutorial();
        }
      }
    }
  };

  mouse_hover_event = (evt: Event) => {
    const mousePos = this.getMousePos(evt);
    const trigger = this.events.find(e =>
      this.isInButton(mousePos.x, mousePos.y, e.coord)
    );
    if (trigger) {
      this.canvas.style.cursor = 'pointer';
      this.hover = null;
      this.hoverButton = trigger;
    } else {
      this.hoverButton = null;
      this.canvas.style.cursor = 'default';
      this.hover = Hex.pixel_to_pointy_hex(mousePos, (this.size * 1.1) | 0);
    }
  };

  setEventListeners() {
    this.canvas.addEventListener('mousemove', this.mouse_hover_event);
    this.canvas.addEventListener('click', this.mouse_click_event);
  }
}
