import {Game, Hex} from '@hex-battle/engine';
import * as mw from '../paima/middleware';
import {BackgroundScreen} from './background_screen';
import {GameScreen} from './game/game_screen';
import {LoadScreen} from './load_screen';
import * as walletStore from '../wallet/wallet_store';
import {ensureConnected} from '../wallet/connect_widget';

interface LobbyData {
  lobby: Lobby;
  players: PlayerData[];
  rounds: Round[];
  gameState: unknown;
}

interface Lobby {
  lobby_id: string;
  current_round: number;
  created_at: Date;
  creation_block_height: number;
  lobby_creator: string;
  lobby_state: string;
  game_winner: null;
  num_of_players: number;
  units: string;
  buildings: string;
  gold: number;
  init_tiles: number;
  time_limit: number;
  round_limit: number;
  started_block_height: number;
  seed: string;
}

interface PlayerData {
  id: number;
  lobby_id: string;
  player_wallet: string;
}

interface Round {
  id: number;
  lobby_id: string;
  wallet: string;
  move: string;
  round: number;
  block_height: number;
}

export class PreGameScreen extends BackgroundScreen {
  drawTimer: any = null;
  fetchTimer: any = null;

  lobby: Lobby | null = null;
  players: PlayerData[] = [];
  rounds: Round[] = [];
  // The server's authoritative exported game state. The client reconstructs the
  // game from THIS (Game.import) — never by re-deriving the board from the seed,
  // which diverges (RNG mismatch) and silently desyncs client vs server.
  gameState: unknown = null;

  constructor(private lobbyId: string) {
    super('full');
  }

  events: {
    coord: {x: number; y: number; width: number; height: number};
    callback: () => void;
  }[] = [];

  DrawText(color = '#34495e', shadowOffset = 0) {
    this.ctx.fillStyle = color;
    this.ctx.font = '50px Electrolize';
    this.ctx.textAlign = 'center';
    const text = `Lobby: ${this.lobbyId}`;
    const x = this.canvas.width / 2 + shadowOffset;
    const y = this.canvas.height * 0.25 + 50 + shadowOffset;
    this.ctx.fillText(text, x, y);

    if (!this.events.length) {
      const textMetrics = this.ctx.measureText(text);
      const w =
        Math.abs(textMetrics.actualBoundingBoxLeft) +
        Math.abs(textMetrics.actualBoundingBoxRight);
      const h =
        Math.abs(textMetrics.actualBoundingBoxAscent) +
        Math.abs(textMetrics.actualBoundingBoxDescent);
      const x_ =
        x -
        (Math.abs(textMetrics.actualBoundingBoxLeft) +
          Math.abs(textMetrics.actualBoundingBoxRight)) /
          2;
      const y_ = y - textMetrics.actualBoundingBoxAscent;

      this.events.push({
        coord: {x: x_, y: y_, width: w, height: h},
        callback: () => {
          const site = window.location.origin;
          navigator.clipboard.writeText(`${site}?lobby=${this.lobbyId}`);
          this.setToastMessage('Lobby URL copied to clipboard');
        },
      });
    }

    this.ctx.font = '30px Electrolize';
    this.ctx.fillText(
      'Waiting for players...',
      this.canvas.width / 2 + shadowOffset,
      this.canvas.height * 0.25 + shadowOffset
    );
    let offset = 50;
    let index = 0;
    for (const p of this.players) {
      this.ctx.font = '30px Electrolize';
      offset += 50;
      index += 1;
      const wallet = (p as any).player_wallet;
      const shortWallet = `${wallet.substring(0, 6)}...${wallet.substring(
        wallet.length - 4
      )}`;

      this.ctx.fillText(
        `Player ${index}: ${shortWallet}`,
        this.canvas.width / 2 + shadowOffset,
        this.canvas.height * 0.25 + offset + shadowOffset
      );
    }
  }

  DrawUI() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.DrawBackground();
    this.DrawText('#fff', 2);
    this.DrawText();
    this.DrawToast();
  }

  moveToGame(isGameOver: boolean) {
    console.log('moving to game');
    this.DrawUI();
    this.stop();

    if (!this.gameState) {
      console.error('No authoritative game state to import — cannot start game');
      return;
    }

    // Reconstruct the EXACT state the on-chain engine produced by importing the
    // server's exported game_state. (Rebuilding from `seed` + replaying rounds
    // diverges: the STM's RNG isn't reproducible from the stored seed, so the
    // board — base/unit placement — comes out different and every move is then
    // rejected as illegal against the server's real board.)
    const game = Game.import(JSON.stringify(this.gameState));

    // localWallet is the *viewing* tab's identity (the server exports it as "");
    // set it so input is gated to this tab's player. Empty → spectate.
    game.localWallet = walletStore.getAddress() ?? '';

    new LoadScreen(game).start().then(_ => {
      const gameScreen = new GameScreen(game, true);
      if (isGameOver && !game.winner) {
        gameScreen.endGameWithDraw = true;
      }
      gameScreen.start();
      console.log(game);
    });
  }

  async fetchLobby() {
    const lobby = await mw.default.getLobby(this.lobbyId);
    if (lobby.success) {
      const lobbyData: LobbyData = lobby.data as any;
      this.players = lobbyData.players;
      this.lobby = lobbyData.lobby;
      this.rounds = lobbyData.rounds;
      this.gameState = lobbyData.gameState;

      const isGameOver =
        this.lobby?.lobby_state === 'finished' ||
        this.lobby?.lobby_state === 'closed';
      if (
        (this.lobby?.lobby_state === 'active' || isGameOver) &&
        this.gameState
      ) {
        this.moveToGame(isGameOver);
      }
    }
  }

  join() {
    if (this.getIsLoading()) return;
    this.setIsLoading(true);
    mw.default
      .joinLobby(this.lobbyId)
      .then(res => {
        if (res.success) {
          location.reload();
        }
      })
      .finally(() => {
        this.setIsLoading(false);
      });
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

  mouse_hover_event = (evt: Event) => {
    const mousePos = this.getMousePos(evt);
    // const trigger = this.events.find(e =>
    //   this.isInButton(mousePos.x, mousePos.y, e.coord)
    // );
    // if (trigger) {
    // this.canvas.style.cursor = 'pointer';
    // this.hover = null;
    // } else {
    this.canvas.style.cursor = 'default';
    this.hover = Hex.pixel_to_pointy_hex(mousePos, 20);
    // }
  };

  mouse_click_event = (evt: Event) => {
    const mousePos = this.getMousePos(evt);
    this.events.forEach(e => {
      if (this.isInButton(mousePos.x, mousePos.y, e.coord)) {
        e.callback();
      }
    });
  };

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

  async start() {
    // eslint-disable-next-line node/no-unsupported-features/node-builtins
    const url = new URL(window.location.href);
    const lobbyURL = url.searchParams.get('lobby') || '';
    if (!lobbyURL) {
      // this should never happen
      window.location.replace('/');
    }

    this.canvas.addEventListener('mousemove', this.mouse_hover_event);
    this.canvas.addEventListener('click', this.mouse_click_event);
    this.drawTimer = setInterval(() => this.DrawUI(), 33);

    await this.fetchLobby();

    // A shared lobby link lands here with no identity in the URL. If the lobby
    // is open and has room, make sure a wallet is connected (prompt the global
    // widget if not) and auto-join if this wallet isn't already a player.
    const joinable =
      !!this.lobby &&
      this.lobby.lobby_state === 'open' &&
      this.players.length < this.lobby.num_of_players;
    if (joinable) {
      try {
        await ensureConnected();
      } catch {
        // user dismissed the connect prompt — stay in the waiting room (spectate)
      }
      const me = this.players.find(
        p => p.player_wallet === walletStore.getAddress()
      );
      if (walletStore.isConnected() && !me) {
        this.join();
      }
    }

    if (
      this.lobby?.lobby_state === 'active' ||
      this.lobby?.lobby_state === 'finished' ||
      this.lobby?.lobby_state === 'closed'
    ) {
      // do not start timer.
    } else {
      this.fetchTimer = setInterval(() => this.fetchLobby(), 10000);
    }
  }

  async stop() {
    this.canvas.removeEventListener('mousemove', this.mouse_hover_event);
    this.canvas.removeEventListener('click', this.mouse_click_event);
    clearInterval(this.drawTimer);
    clearInterval(this.fetchTimer);
  }
}
