import 'phaser';
import mw from '@game/middleware';
import { WalletMode } from '@paima/sdk/providers';

export class Wallet extends Phaser.Scene {
  constructor() {
    super('wallet_scene');
  }
  preload() {
    this.load.image('background', 'assets/background_wallet2.jpg');
    this.load.image('soldier', 'assets/soldier2.jpg');
    this.load.image('button-green', 'assets/button-green.png');
    this.load.audio('soldier-voice', ['assets/connect-wallet.mp3']);
  }
  create() {
    this.sound.pauseOnBlur = false;

    this.add.image(400, 300, 'background').setScale(0.8);

    const graphics = this.add.graphics();
    graphics.lineStyle(5, 0x34495e, 1);
    graphics.fillStyle(0x2c3e50, 0.7);
    graphics.fillRect(32, 80, 800 - 32 * 2, 220);

    const soldier = this.add.image(140, 190, 'soldier').setScale(0.35);

    const soldierVoice = this.sound.add('soldier-voice', { loop: false });
    soldierVoice.play();
    const text = `Commander! We need to defend the outpost. 
But we were caught in the middle of the 
rock-scissors-paper war. 
Please connect your wallet to be able to
send commands to your allies.`;
    const graphicsText = this.add.text(260, 115, text, {
      fontSize: '24px',
      fontFamily: '"Trebuchet MS", Helvetica',
      color: '#fff',
    });
    let count = 0;

    // Clear this when leaving screen.
    const intervalID = setInterval(() => {
      try {
        count += 1;
        graphicsText.setText(text.substring(0, count));
        if (count > text.length) {
          clearInterval(intervalID);
        }
      } catch (e) {
        clearInterval(intervalID);
      }
    }, 70);

    const button = this.add.image(400, 450, 'button-green').setScale(0.4);

    button.setInteractive();

    button.on('pointerdown', async () => {
      soldierVoice.stop();
      try {
        const wallet = await mw.userWalletLogin({
          mode: WalletMode.EvmInjected,
          preferBatchedMode: false,
        });
        if (wallet.success) {
          this.scene.start('lobby_scene');
        } else {
          console.log('Error connecting wallet');
        }
      } catch (e) {
        console.log('Error', e);
      }
    });

    const buttonText = this.add.text(300, 435, 'Connect Wallet', {
      fontSize: '28px',
      fontFamily: '"Trebuchet MS", Helvetica',
      color: '#fff',
    });
  }

  update() {}
}
