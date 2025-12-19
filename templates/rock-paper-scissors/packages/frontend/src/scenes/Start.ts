import 'phaser';

export class Start extends Phaser.Scene {
  constructor() {
    super('start_scene');
  }
  preload() {
    this.load.image('logo', 'assets/logo.jpg');
    this.load.image('button-green', 'assets/button-green.png');
  }
  create() {
    this.sound.pauseOnBlur = false;

    this.add.image(400, 300, 'logo').setScale(0.4);
    const button = this.add.image(400, 540, 'button-green').setScale(0.4);

    button.setInteractive();
    button.on('pointerdown', () => {
      this.scene.start('wallet_scene');
    });

    const buttonText = this.add.text(330, 525, 'Start Battle', {
      fontSize: '28px',
      fontFamily: '"Trebuchet MS", Helvetica',
      color: '#fff',
    });
  }
  update() {}
}
