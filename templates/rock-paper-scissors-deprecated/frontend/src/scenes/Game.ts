import 'phaser';
import { rocksNames, papersNames, scissorsNames } from './names';
import mw from '@game/middleware';
import type { RPSActionsStates, TickEvent } from '@game/game-logic';
import { RPSActions } from '@game/game-logic';

type RPSButton = {
  image: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  border: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  type: RPSActions;
};

function setButtonVisibility(button: RPSButton, visibility: boolean) {
  button.border.setVisible(visibility);
  button.image.setVisible(visibility);
}

export class Game extends Phaser.Scene {
  rocksNames: string[];
  papersNames: string[];
  scissorsNames: string[];

  rocks: string[] = [];
  papers: string[] = [];
  scissors: string[] = [];

  graphics: Phaser.GameObjects.Graphics = null;
  graphicsText: Phaser.GameObjects.Text = null;
  graphicsText2: Phaser.GameObjects.Text = null;

  lobbyInfo: any = null;
  wallet = '';
  lobbyId: string = null;
  round = 0;

  rock: RPSButton = null;
  paper: RPSButton = null;
  scissor: RPSButton = null;
  scoreText: Phaser.GameObjects.Text = null;
  timer: Phaser.GameObjects.Text = null;
  battle_music: Phaser.Sound.BaseSound = null;
  tick = 0;
  waitingToEnd = false;
  alert: {
    text: Phaser.GameObjects.Text;
    background: Phaser.GameObjects.Graphics;
  } = { text: null, background: null };

  constructor() {
    super('game_scene');
    this.rocksNames = rocksNames.sort(function () {
      return 0.5 - Math.random();
    });
    this.papersNames = papersNames.sort(function () {
      return 0.5 - Math.random();
    });
    this.scissorsNames = scissorsNames.sort(function () {
      return 0.5 - Math.random();
    });

    // remove any listener.
    //   scene.sys.events.once(‘shutdown’, () => {
    //     eventEmitter.off(“eventName”, functionName)
    //     });
  }

  init(data: { lobbyInfo: any; wallet: string; lobbyId: string; round: number }) {
    this.lobbyInfo = data.lobbyInfo;
    this.wallet = data.wallet;
    this.lobbyId = data.lobbyId;
    this.round = data.round;
  }

  preload() {
    this.load.image('background-2', 'assets/background.jpg');

    for (let r = 1; r <= 10; r += 1) {
      this.load.image('r' + r, 'assets/r' + r + '.jpg');
      this.rocks.push('r' + r);
    }
    for (let p = 1; p <= 11; p += 1) {
      this.load.image('p' + p, 'assets/p' + p + '.jpg');
      this.papers.push('p' + p);
    }
    for (let s = 1; s <= 12; s += 1) {
      this.load.image('s' + s, 'assets/s' + s + '.jpg');
      this.scissors.push('s' + s);
    }

    this.rocks.sort(function () {
      return 0.5 - Math.random();
    });
    this.papers.sort(function () {
      return 0.5 - Math.random();
    });
    this.scissors.sort(function () {
      return 0.5 - Math.random();
    });

    this.load.audio('rockselect', ['assets/rock.wav']);
    this.load.audio('paperselect', ['assets/paper.wav']);
    this.load.audio('scissorsselect', ['assets/scissors.wav']);
    this.load.audio('battle-music', ['/assets/battle_music.mp3']);

    this.load.image('border3', 'assets/border1.png');
    this.load.image('border2', 'assets/border6.png');
    this.load.image('border1', 'assets/border3.png');

    this.load.audio('exposion', ['assets/sfx-exposion.mp3']);
  }

  private setupRPSButton(
    type: RPSActions,
    x: number,
    y: number,
    borderIdentifier: string,
    audioIdentifier: string
  ): RPSButton {
    let image = '';
    switch (type) {
      case RPSActions.ROCK:
        image = this.rocks[0];
        break;

      case RPSActions.PAPER:
        image = this.papers[0];
        break;

      case RPSActions.SCISSORS:
        image = this.scissors[0];
        break;
    }

    const actionButton = this.physics.add.sprite(x, y, image).setScale(0.2);

    const bounce = 0.2 + 0.2 * Math.random();

    actionButton.setInteractive();
    actionButton.setBounce(bounce);
    actionButton.setCollideWorldBounds(true);
    const border = this.physics.add.sprite(x, y, borderIdentifier).setScale(0.41);
    border.setBounce(bounce);
    border.setCollideWorldBounds(true);

    const button: RPSButton = { image: actionButton, border: border, type };
    setButtonVisibility(button, false);
    this.setInteractionForActionButton(button);
    return button;
  }

  setInteractionForActionButton(button: RPSButton) {
    let image = '';
    let name = '';
    let text = '';
    let audio = '';
    switch (button.type) {
      case RPSActions.ROCK:
        image = this.rocks[0];
        name = this.rocksNames[0];
        text = 'ROCK conclave';
        audio = 'rockselect';
        break;

      case RPSActions.PAPER:
        image = this.papers[0];
        name = this.papersNames[0];
        text = 'PAPER dimension';
        audio = 'paperselect';
        break;

      case RPSActions.SCISSORS:
        image = this.scissors[0];
        name = this.scissorsNames[0];
        text = 'SCISSOR society';
        audio = 'scissorsselect';
        break;
    }

    button.image.off('pointerup');
    button.image.off('pointerover');
    button.image.off('pointerout');
    button.image.on('pointerover', (pointer: any) => {
      this.graphics.visible = true;
      this.graphicsText.setText(`support the ${text}`);
      this.graphicsText.visible = true;
      this.graphicsText2.setText(name);
      this.graphicsText2.visible = true;

      button.image.setScale(0.2 * 1.5);
      button.border.setScale(0.41 * 1.5);
    });

    button.image.on('pointerout', (pointer: any) => {
      this.graphics.visible = false;
      this.graphicsText.visible = false;
      this.graphicsText2.visible = false;
      button.image.setScale(0.2);
      button.border.setScale(0.41);
    });

    button.image.on('pointerup', (pointer: any) => {
      if (this.round !== 0) {
        const audioAction = this.sound.add(audio, { loop: false });
        audioAction.play();
        this.selectType(button.type);

        mw.submitMoves(this.lobbyId, this.round, button.type).then((submit: any) => {
          console.log(submit);

          if (submit.success) {
            // wait.
          } else {
            // Revert.
            this.resetGame();
          }
        });
      } else {
        console.log('Cannot send commands before round 1');
      }
    });
  }

  selectType(type: RPSActions) {
    const reset = (a: RPSButton) => {
      a.image.off('pointerup');
      a.image.off('pointerover');
      a.image.off('pointerout');
    };
    switch (type) {
      case RPSActions.ROCK:
        reset(this.rock);
        break;
      case RPSActions.PAPER:
        reset(this.paper);
        break;
      case RPSActions.SCISSORS:
        reset(this.scissor);
        break;
    }
    this.graphics.visible = true;
    this.graphicsText.visible = true;
    this.graphicsText2.visible = true;

    setButtonVisibility(this.rock, false);
    setButtonVisibility(this.scissor, false);
    setButtonVisibility(this.paper, false);

    switch (type) {
      case RPSActions.ROCK:
        reset(this.rock);
        break;
      case RPSActions.PAPER:
        reset(this.paper);
        break;
      case RPSActions.SCISSORS:
        reset(this.scissor);
        break;
    }
  }

  setupTexts() {
    this.graphics = this.add.graphics();
    this.graphics.setInteractive();
    this.graphics.fillStyle(0x2c3e50, 0.7);
    this.graphics.fillRect(32, 80, 800 - 32 * 2, 130);
    this.graphics.visible = false;
    this.graphicsText = this.add.text(200, 100, '', {
      fontSize: '32px',
      fontFamily: '"Trebuchet MS", Helvetica, Tahoma',
      color: '#fff',
      align: 'center',
    });
    this.graphicsText.visible = false;
    this.graphicsText2 = this.add.text(260, 140, '', {
      fontSize: '40px',
      fontFamily: 'Impact',
      color: '#fff',
      align: 'center',
    });
    this.graphicsText2.visible = false;

    this.alert.background = this.add.graphics();
    this.alert.background.fillStyle(0xe74c3c, 1.0);
    this.alert.background.fillRect(32, 80, 800 - 32 * 2, 130);
    this.alert.background.visible = false;
    this.alert.text = this.add.text(100, 100, '', {
      fontSize: '20px',
      fontFamily: '"Trebuchet MS", Helvetica, Tahoma',
      color: '#fff',
      align: 'center',
    });
    this.alert.text.visible = false;
  }

  create() {
    this.sound.pauseOnBlur = false;

    this.waitingToEnd = false;
    this.tick = 0;
    // music
    this.battle_music = this.sound.add('battle-music', { loop: true });
    this.battle_music.play();

    // background
    this.add.image(400, 300, 'background-2').setScale(0.6);

    // score
    this.scoreText = this.add.text(16, 16, '', { fontSize: '18px', fill: '#FFF' } as any);
    this.updateGlobalMessage();

    // timer
    this.timer = this.add.text(500, 16, '', { fontSize: '18px', fill: '#FFF' } as any);

    // Setup On-Scroll Texts
    this.setupTexts();

    // Setup Main Buttons
    this.rock = this.setupRPSButton(RPSActions.ROCK, 150, 120, 'border1', 'rockselect');
    this.scissor = this.setupRPSButton(RPSActions.SCISSORS, 400, 100, 'border2', 'scissorsselect');
    this.paper = this.setupRPSButton(RPSActions.PAPER, 650, 110, 'border3', 'paperselect');

    // Started game that ended.
    if (this.lobbyInfo.lobby_state === 'finished') {
      console.log('Game has end');
      this.battle_music.stop();
      this.scene.start('lobby_scene');
      this.scene.stop();
    }
  }

  resetGame() {
    this.graphics.visible = false;
    this.graphicsText.visible = false;
    this.graphicsText2.visible = false;

    this.setInteractionForActionButton(this.rock);
    this.setInteractionForActionButton(this.paper);
    this.setInteractionForActionButton(this.scissor);

    this.rock.image.setScale(0.2);
    this.rock.border.setScale(0.41);
    this.paper.image.setScale(0.2);
    this.paper.border.setScale(0.41);
    this.scissor.image.setScale(0.2);
    this.scissor.border.setScale(0.41);
  }

  updateGlobalMessage() {
    if (this.round === 0) {
      this.scoreText.setText('Waiting for Enemy Commander Player at ' + this.lobbyId);
      return;
    }

    const amIfirstPlayer = this.lobbyInfo.lobby_creator === this.wallet;
    const myScore = amIfirstPlayer ? 0 : 1;
    const OpponentScore = amIfirstPlayer ? 1 : 0;

    this.scoreText.setText(
      `Battle [${this.lobbyId}] ${this.lobbyInfo.latest_match_state}
Round ${this.round} / ${this.lobbyInfo.num_of_rounds}
Score You ${myScore} - Opponent ${OpponentScore}`
    );
  }

  showAlert(message: string, color: number) {
    const horn = this.sound.add('horn', { loop: false });
    horn.play();

    this.alert.background.destroy();
    this.alert.text.destroy();

    this.alert.background = this.add.graphics();
    this.alert.background.fillStyle(color, 1.0);
    this.alert.background.fillRect(32, 80, 800 - 32 * 2, 130);

    this.alert.text = this.add.text(100, 100, '', {
      fontSize: '28px',
      fontFamily: '"Trebuchet MS", Helvetica, Tahoma',
      color: '#fff',
      align: 'left',
    });
    this.alert.text.setText(message);
    setTimeout(() => {
      this.alert.background.visible = false;
      this.alert.text.setText(message);
      this.alert.text.visible = false;
    }, 5000);
  }

  async pullAndUpdateGameState() {
    const lobbyInfo = await mw.getLobbyState(this.lobbyId);
    if (!lobbyInfo.success) throw new Error('Cannot get Lobby Info');

    const prevRound = this.lobbyInfo.current_round;

    // Update internal state
    this.round = lobbyInfo.lobby.current_round;
    this.lobbyInfo = lobbyInfo.lobby;

    // Waiting for Player 2
    if (this.round === 0) {
      this.updateGlobalMessage();
      setButtonVisibility(this.rock, false);
      setButtonVisibility(this.scissor, false);
      setButtonVisibility(this.paper, false);
      return;
    }
    setButtonVisibility(this.rock, true);
    setButtonVisibility(this.scissor, true);
    setButtonVisibility(this.paper, true);

    // Game Ended!
    if (this.lobbyInfo.lobby_state === 'finished') {
      this.waitingToEnd = true;
      const { message, color } = await this.runRoundExecuter(prevRound);
      this.showAlert(message, color);
      setTimeout(() => {
        this.scene.stop(); // no more updates.
        this.battle_music.stop();
        this.scene.start('lobby_scene');
      }, 5000);
      return;
    }

    // New Round
    // When changing round run executer.
    // When entering round 1 from 0 (waiting on player 2) do not run executer.
    if (this.round !== prevRound) {
      if (prevRound !== 0) {
        const { message, color } = await this.runRoundExecuter(prevRound);
        this.showAlert(message, color);
      } else {
        const horn = this.sound.add('horn', { loop: false });
        horn.play();
      }
      this.resetGame();
      this.updateGlobalMessage();
    }
  }

  update() {
    this.tick += 1;
    if (this.waitingToEnd) return;

    // Each 2 seconds.
    if (this.tick % (60 * 2) === 0) {
      this.pullAndUpdateGameState().catch(err => console.log('Update error', err));
    }

    // Each +/- 1 seg
    if (this.tick % (60 * 1) === 0) {
      if (this.round === 0) {
        // Do not update timer.
      } else {
        this.timer.setText(`Time Remaining ${this.lobbyInfo.round_ends_in_blocks * 4} s`);
      }
    }
  }

  action2Name(input: RPSActionsStates): 'ROCK' | 'PAPER' | 'SCISSORS' | 'NONE' {
    switch (input) {
      case RPSActions.ROCK:
        return 'ROCK';
      case RPSActions.PAPER:
        return 'PAPER';
      case RPSActions.SCISSORS:
        return 'SCISSORS';
      default:
        return 'NONE';
    }
  }

  async runRoundExecuter(roundToRun: number): Promise<{ message: string; color: number }> {
    const x = await mw.getRoundExecutor(this.lobbyId, roundToRun);
    if (!x.success) throw new Error('Round executer failed');

    let ticks: TickEvent[] = [];
    while (ticks) {
      ticks = x.result.tick();
      if (ticks) {
        console.log('tick', ticks);
        const { move1, move2, user1, winner } = { ...ticks[0] };
        const isPlayer1 = user1 === this.wallet;

        let state = 'TIE';

        if (isPlayer1 && winner === 'user1') state = 'WIN';
        if (!isPlayer1 && winner === 'user2') state = 'WIN';

        if (isPlayer1 && winner === 'user2') state = 'LOSE';
        if (!isPlayer1 && winner === 'user1') state = 'LOSE';

        let color = 0xe67e22; // yellow
        if (state === 'WIN') color = 0x27ae60; // green
        if (state === 'LOSE') color = 0xe74c3c; // red

        const enemyMove = this.action2Name(isPlayer1 ? move2 : move1);
        const yourMove = this.action2Name(isPlayer1 ? move1 : move2);

        const message = `You played ${yourMove}\nYour enemy played ${enemyMove}!
You ${state}! (Round ${roundToRun} of ${this.lobbyInfo.num_of_rounds})`;

        return { message, color };
      }
    }
    throw new Error('Executer did not run any ticks.');
  }
}
