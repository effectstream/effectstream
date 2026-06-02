import {UnitType, BuildingType, AIPlayer} from '@hex-battle/engine';
import {GameScreen} from './frontend/game/game_screen';
import {LoadScreen, loadFont} from './frontend/load_screen';
import {LobbyScreen} from './frontend/lobby_screen';
import {PreGameScreen} from './frontend/pregame_screen';
import {RulesScreen} from './frontend/game/rules_screen';
import {StartupScreen} from './frontend/startup_screen';
import * as mw from './paima/middleware';
import {RandomGame} from './random-game';
import {nameToLogin} from './frontend/name_to_login';

const TUTORIAL = false;
const PRACTICE = false;
const SKIP_STARTUP = false;

(async () => {
  console.log('Welcome to HexBattle!');

  // --- Headless-e2e / integration namespace (additive — does not alter the
  // game). Mirrors the world-map-2d `window.<template>` pattern so a headless
  // Chromium can connect the local-JS wallet (EvmViem) and drive a write tx
  // without pixel-driving the canvas. The real game still drives everything
  // through `mw` exactly as before. -------------------------------------------
  const hexBattle = {
    connectBrowserWallet: async () => {
      const r = await mw.default.userWalletLogin(nameToLogin('metamask', false));
      hexBattle._reflectAddress();
      return r;
    },
    connectLocalWallet: async () => {
      const r = await mw.default.userWalletLogin(nameToLogin('local', false));
      hexBattle._reflectAddress();
      return r;
    },
    createLobby: (
      numOfPlayers = 2,
      units = 'A',
      buildings = 'b',
      gold = 10,
      initTiles = 4,
      map: string[] = [
        '0#0', '-1#1', '0#1', '1#0', '1#-1', '0#-1', '-1#0',
        '-2#2', '-1#2', '0#2', '1#1', '2#0', '2#-1', '2#-2',
        '1#-2', '0#-2', '-1#-1', '-2#0', '-2#1',
        '-3#3', '-2#3', '-1#3', '0#3', '1#2', '2#1', '3#0',
        '3#-1', '3#-2', '3#-3', '2#-3', '1#-3', '0#-3',
        '-1#-2', '-2#-1', '-3#0', '-3#1', '-3#2',
      ],
    ) =>
      mw.default.createLobby(numOfPlayers, units, buildings, gold, initTiles, map),
    joinLobby: (id: string) => mw.default.joinLobby(id),
    submitMove: (id: string, round: number, move: string[]) =>
      mw.default.submitMoves(id, round, move),
    surrender: (id: string) => mw.default.surrender(id),
    getOpenLobbies: () => mw.default.getOpenLobbies(),
    getAddress: () => {
      const w = mw.default.getUserWallet(null, () => ({success: false} as any));
      return w.success ? (w as any).result : null;
    },
    _reflectAddress() {
      const addr = hexBattle.getAddress();
      let el = document.querySelector('[data-testid="wallet-address"]');
      if (!el) {
        el = document.createElement('div');
        el.setAttribute('data-testid', 'wallet-address');
        (el as HTMLElement).style.display = 'none';
        document.body.appendChild(el);
      }
      el.textContent = addr ?? '';
    },
  };
  (window as any).hexBattle = hexBattle;

  await loadFont();

  if (TUTORIAL) {
    const game = RulesScreen.Setup();
    new LoadScreen(game).start().then(_ => {
      new RulesScreen(game).start();
    });
    return;
  }

  if (PRACTICE) {
    const game = new RandomGame(
      'PRACTICE',
      'OFFLINE',
      0,
      5,
      'large',
      Array(1).fill(UnitType.UNIT_1),
      [BuildingType.BASE],
      4,
      100,
      0.24
    );

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
    return;
  }

  if (PRACTICE || TUTORIAL) {
    return;
  }

  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  const url = new URL(window.location.href);
  const lobby = url.searchParams.get('lobby');
  const wallet = url.searchParams.get('wallet');

  if (lobby && wallet) {
    const pregame_screen = new PreGameScreen(lobby, wallet);
    pregame_screen.start();
    return;
  }

  if (lobby && !wallet) {
    (window as any).wallet_selection_show((options: {wallet: string}) => {
      if (options.wallet) {
        mw.default
          .userWalletLogin(nameToLogin(options.wallet, false))
          .then((x: any) => {
            if (x.success) {
              window.location.replace(
                `/?lobby=${lobby}&wallet=${options.wallet}&account=${mw.localAccountIndex()}`
              );
            }
          });
      }
    });
    const gameLobby = new LobbyScreen();
    gameLobby.start();
  } else {
    if (SKIP_STARTUP) {
      const gameLobby = new LobbyScreen();
      gameLobby.start();
    } else {
      const startupScreen = new StartupScreen(() => {
        const gameLobby = new LobbyScreen();
        gameLobby.start();
      });
      startupScreen.start();
    }
  }
})();
