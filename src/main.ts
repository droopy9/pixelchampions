import Phaser from 'phaser';
import { VIEW } from './game/constants';
import { TitleScene } from './scenes/TitleScene';
import { VerifyScene } from './scenes/VerifyScene';
import { LobbyScene } from './scenes/LobbyScene';
import { RaceScene } from './scenes/RaceScene';
import { ResultScene } from './scenes/ResultScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW.width,
  height: VIEW.height,
  pixelArt: true,
  backgroundColor: '#1a2a4a',
  dom: { createContainer: true },
  scene: [TitleScene, VerifyScene, LobbyScene, RaceScene, ResultScene]
});
