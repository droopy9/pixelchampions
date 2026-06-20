import Phaser from 'phaser';
import { JUMP_DURATION, JUMP_HEIGHT_SCALE } from '../game/constants';
import type { RunnerColor } from '../game/textures';
import type { RacerSnap } from './socket';

const RUN_CYCLE: number[] = [0, 1, 2, 1];

export class RacerView {
  id: string;
  name: string;
  color: RunnerColor;
  isBot: boolean;
  isLocalPlayer: boolean;

  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;

  worldX = 0;
  worldY = 0;
  forwardAngle = 0;
  lateral = 0;
  progress = 0;
  distance = 0;
  laps = 0;
  energy = 0;
  boosting = false;
  jumping = false;
  stunned = false;
  finished = false;

  private localJumpStart = 0;

  constructor(scene: Phaser.Scene, snap: RacerSnap, isLocalPlayer: boolean) {
    this.id = snap.id;
    this.name = snap.name;
    this.color = snap.color;
    this.isBot = snap.isBot;
    this.isLocalPlayer = isLocalPlayer;

    this.shadow = scene.add.image(snap.worldX, snap.worldY, 'shadow');
    this.sprite = scene.add
      .sprite(snap.worldX, snap.worldY, `runner_${snap.color}_1`)
      .setOrigin(0.5, 1);
    this.nameText = scene.add
      .text(snap.worldX, snap.worldY - 30, snap.name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: isLocalPlayer ? '#ffcc33' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2
      })
      .setOrigin(0.5, 1);
  }

  applySnap(snap: RacerSnap, time: number) {
    if (snap.jumping && !this.jumping) this.localJumpStart = time;
    this.worldX = snap.worldX;
    this.worldY = snap.worldY;
    this.forwardAngle = snap.forwardAngle;
    this.lateral = snap.lateral;
    this.progress = snap.progress;
    this.distance = snap.distance;
    this.laps = snap.laps;
    this.energy = snap.energy;
    this.boosting = snap.boosting;
    this.jumping = snap.jumping;
    this.stunned = snap.stunned;
    this.finished = snap.finished;
    this.name = snap.name;
    if (this.nameText.text !== snap.name) this.nameText.setText(snap.name);
  }

  render(time: number) {
    const frame = this.finished ? 1 : RUN_CYCLE[Math.floor(time / 70) % RUN_CYCLE.length];
    this.sprite.setTexture(`runner_${this.color}_${frame}`);

    this.sprite.setPosition(this.worldX, this.worldY);
    this.shadow.setPosition(this.worldX, this.worldY - 2);

    const spriteRot = this.forwardAngle + Math.PI / 2;
    this.sprite.setRotation(spriteRot);
    this.shadow.setRotation(spriteRot);

    let scale = 1;
    let shadowScale = 1;
    if (this.jumping) {
      const t = (time - this.localJumpStart) / JUMP_DURATION;
      const jumpFrac = Math.max(0, Math.sin(Math.min(1, Math.max(0, t)) * Math.PI));
      scale = 1 + jumpFrac * JUMP_HEIGHT_SCALE;
      shadowScale = 1 - jumpFrac * 0.55;
    }
    this.sprite.setScale(scale);
    this.shadow.setScale(shadowScale, shadowScale * 0.6);

    const baseDepth = this.worldY;
    this.sprite.setDepth(baseDepth + (this.jumping ? 1000 : 0));
    this.shadow.setDepth(baseDepth - 0.5);

    if (this.stunned) {
      this.sprite.setAlpha(Math.sin(time / 30) > 0 ? 1 : 0.4);
      this.sprite.clearTint();
    } else if (this.boosting) {
      this.sprite.setTint(0xffffaa);
      this.sprite.setAlpha(1);
    } else {
      this.sprite.clearTint();
      this.sprite.setAlpha(1);
    }
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.nameText.destroy();
  }
}
