import 'phaser';
import config from './config';
import { Game } from './scenes/Game';
import { Lobby } from './scenes/Lobby';
import { Start } from './scenes/Start';
import { Wallet } from './scenes/Wallet';

new Phaser.Game(
  Object.assign(config, {
    scene: [Start, Wallet, Lobby, Game],
  })
);
