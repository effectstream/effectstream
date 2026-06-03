import {UnitType, BuildingType, AIPlayer} from '@hex-battle/engine';
import {GameScreen} from './frontend/game/game_screen';
import {LoadScreen, loadFont} from './frontend/load_screen';
import {LobbyScreen} from './frontend/lobby_screen';
import {PreGameScreen} from './frontend/pregame_screen';
import {RulesScreen} from './frontend/game/rules_screen';
import {StartupScreen} from './frontend/startup_screen';
import * as mw from './paima/middleware';
import {RandomGame} from './random-game';
import {mountConnectWidget} from './wallet/connect_widget';
import * as walletStore from './wallet/wallet_store';

const TUTORIAL = false;
const PRACTICE = false;
const SKIP_STARTUP = false;

(async () => {
  console.log('Welcome to HexBattle!');

  // The single global wallet connector (top-right button + modal). It holds the
  // connected wallet in ./wallet/wallet_store — the single source of truth the
  // game reads via mw.getUserWallet().
  mountConnectWidget();
  // Reconnect this tab's wallet (per-tab sessionStorage) BEFORE any screen reads
  // identity. Empty on a fresh tab; restores the same wallet across the game's
  // redirects/reloads so the player keeps their identity.
  await walletStore.restoreFromSession();

  // --- Headless-e2e / integration namespace (additive — does not alter the
  // game). Mirrors the world-map-2d `window.<template>` pattern so a headless
  // Chromium can connect a wallet and drive a write tx without pixel-driving the
  // canvas. The real game drives everything through `mw` + the connect widget. --
  const hexBattle = {
    // Real installed wallet (MetaMask, …); headless Chromium has none, so this
    // rejects there — the e2e drives connectLocalWallet instead.
    connectBrowserWallet: () => walletStore.connectInjected(),
    // Deterministic dev wallet (Hardhat #0) for headless e2e ONLY — keeps the
    // fixed-address assertion stable. Real users get a random browser wallet
    // via the connect widget, never this.
    connectLocalWallet: () => walletStore.connectDeterministicDevWallet(),
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
    // Full lowercase address of the connected wallet (the widget keeps the
    // visible chip in sync separately). null when not connected.
    getAddress: () => walletStore.getAddress(),
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

  // Identity is the connected wallet (restored above), NOT the URL — a shared
  // lobby link only needs ?lobby. PreGameScreen prompts a connect when you join.
  if (lobby) {
    new PreGameScreen(lobby).start();
    return;
  }

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
})();
