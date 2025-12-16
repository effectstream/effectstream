import mw from '@game/middleware';
import type { QueryLobby } from '@game/utils';
import { WalletMode } from '@paima/sdk/providers';

export class Lobby extends Phaser.Scene {
  constructor() {
    super('lobby_scene');
  }
  preload() {
    // this.load.script('paima', 'assets/paimaMiddleware.js');
    this.load.image('background', 'assets/background_wallet2.pjpgng');
    this.load.image('button-green', 'assets/button-green.png');
    this.load.image('button-red', 'assets/red-button.png');
    this.load.image('reload', 'assets/reload.png');
    this.load.audio('horn', ['assets/sfx-horn.mp3']);
  }

  create() {
    this.sound.pauseOnBlur = false;

    this.add.image(400, 300, 'background').setScale(0.8);

    const restart = this.add.image(700, 40, 'reload').setScale(0.1);
    restart.setInteractive();
    restart.on('pointerdown', () => {
      this.scene.restart();
    });

    const graphicsText = this.add.text(60, 45, 'Commander, select your battle', {
      fontSize: '24px',
      fontFamily: '"Trebuchet MS", Helvetica',
      color: '#fff',
    });

    // Create NEW BATTLE
    const buttonB = this.add.image(200, 550, 'button-green').setScale(0.4);
    const buttonText2 = this.add.text(135, 535, 'New Battle', {
      fontSize: '28px',
      fontFamily: '"Trebuchet MS", Helvetica',
      color: '#fff',
    });

    buttonB.setInteractive();
    buttonB.on('pointerdown', async () => {
      const wallet = await mw.userWalletLogin({
        mode: WalletMode.EvmInjected,
        preferBatchedMode: false,
      });
      if (!wallet.success) return;
      const x = await mw.createLobby(3, 60, false, false);
      if (!x.success) return;
      const lobbyState = await mw.getLobbyState(x.lobbyID);
      if (!lobbyState.success) return;

      this.startBattle(x.lobbyID, wallet.result.walletAddress, lobbyState);
    });

    // Create NEW BATTLE
    const buttonC = this.add.image(600, 550, 'button-green').setScale(0.4);
    const buttonText3 = this.add.text(535, 535, 'AI Battle', {
      fontSize: '28px',
      fontFamily: '"Trebuchet MS", Helvetica',
      color: '#fff',
    });

    buttonC.setInteractive();
    buttonC.on('pointerdown', async () => {
      const wallet = await mw.userWalletLogin({
        mode: WalletMode.EvmInjected,
        preferBatchedMode: false,
      });
      if (!wallet.success) return;
      const x = await mw.createLobby(3, 60, false, true);
      if (!x.success) return;
      const lobbyState = await mw.getLobbyState(x.lobbyID);
      if (!lobbyState.success) return;

      this.startBattle(x.lobbyID, wallet.result.walletAddress, lobbyState);
    });

    this.updateLobbyUI();
  }

  startBattle(lobbyId: string, walletAddress: string, lobbyState: /* PackedLobbyState*/ any) {
    const horn = this.sound.add('horn', { loop: false });
    horn.play();

    const red = Phaser.Math.Between(50, 255);
    const green = Phaser.Math.Between(50, 255);
    const blue = Phaser.Math.Between(50, 255);

    this.cameras.main.fade(2000, red, green, blue);
    setTimeout(() => {
      this.scene.start('game_scene', {
        lobbyInfo: lobbyState.lobby,
        wallet: walletAddress,
        lobbyId: lobbyId,
        round: lobbyState.lobby.current_round,
      });
      this.scene.stop();
    }, 2000);
  }

  createBattleButtons(lobbies: QueryLobby[], newOrRejoin: 'new' | 'rejoin') {
    const isNew = newOrRejoin === 'new';
    const y = 90;
    const x = isNew ? 260 : 560;
    const offset = 136;
    const buttonName = isNew ? 'button-green' : 'button-red';
    for (let i = 0; i < lobbies.length; i += 1) {
      if (i >= 4) {
        // Show only first 4lobbies.
        break;
      }
      const buttonA = this.add.image(x, y * i + offset + 24, buttonName).setScale(0.4);
      buttonA.setInteractive();

      const lobbyId = lobbies[i].lobby_id;
      buttonA.on('pointerdown', async () => {
        try {
          const wallet = await mw.userWalletLogin({
            mode: WalletMode.EvmInjected,
            preferBatchedMode: false,
          });
          if (!wallet.success) return;

          if (isNew) {
            // Join Existing
            const joined = await mw.joinLobby(lobbyId);
            if (!joined.success) throw new Error('Cannot Join Lobby');

            const lobbyState = await mw.getLobbyState(lobbyId);
            if (!lobbyState.success) throw new Error('Cannot get Lobby State');

            this.startBattle(lobbyId, wallet.result.walletAddress, lobbyState);
          } else {
            // Reconnect
            const lobbyState = await mw.getLobbyState(lobbyId);
            if (!lobbyState.success) throw new Error('Cannot get Lobby State');
            this.startBattle(lobbyId, wallet.result.walletAddress, lobbyState);
          }
        } catch (e) {
          console.log('ERROR', e);
        }
      });

      const buttonText1 = this.add.text(
        x - 85,
        y * i + offset,
        (isNew ? 'Join Battle\n' : 'Reconnect Battle\n') + lobbyId,
        {
          fontSize: '22px',
          fontFamily: '"Trebuchet MS", Helvetica',
          color: '#fff',
        }
      );
    }
  }

  async updateLobbyUI() {
    const wallet = await mw.userWalletLogin({
      mode: WalletMode.EvmInjected,
      preferBatchedMode: false,
    });
    if (!wallet.success) throw new Error('Cannot get wallet');

    // Run in parallel: Joinable and existing Lobbies.
    mw.getUserLobbiesMatches(wallet.result.walletAddress, 1, 100).then(myLobbies => {
      if (myLobbies.success) {
        this.createBattleButtons(
          myLobbies.lobbies.filter(l => l.lobby_state !== 'finished'),
          'rejoin'
        );
      }
    });

    mw.getOpenLobbies(wallet.result.walletAddress, 1, 10).then(lobbies => {
      if (lobbies.success) {
        this.createBattleButtons(lobbies.lobbies, 'new');
      }
    });
  }

  tick = 0;
  update() {
    this.tick += 1;
    if (this.tick % (60 * 4) === 0) {
    }
  }
}
