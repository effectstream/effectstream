import 'phaser';

export default {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#000',
  scale: {
    width: 800,
    height: 600,
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 300 },
      debug: false,
    },
  },
};
