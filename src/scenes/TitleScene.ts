import Phaser from 'phaser';
import { VIEW } from '../game/constants';
import { ensureTextures, RUNNER_COLORS } from '../game/textures';
import { music } from '../audio/music';

export class TitleScene extends Phaser.Scene {
  private parade: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super('TitleScene');
  }

  create() {
    ensureTextures(this);

    this.cameras.main.setBackgroundColor('#1a2a4a');

    const cx = VIEW.width / 2;

    this.add
      .text(cx, 130, 'PIXEL\nCHAMPS', {
        fontFamily: 'monospace',
        fontSize: '60px',
        color: '#ffcc33',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 6,
        lineSpacing: -8
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 260, 'pixel obstacle racing', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9bb6ff'
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 290, '◆ RACE FOR SOL REWARDS ◆', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#9bffd0',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5);

    const baseY = 400;
    const scale = 3;
    const spacing = 50;
    const count = RUNNER_COLORS.length;
    const totalWidth = (count - 1) * spacing;
    const startX = cx - totalWidth / 2;
    RUNNER_COLORS.forEach((c, i) => {
      const sp = this.add
        .sprite(startX + i * spacing, baseY, `runner_${c}_0`)
        .setScale(scale)
        .setOrigin(0.5, 1)
        .setData('color', c);
      this.parade.push(sp);
      this.tweens.add({
        targets: sp,
        y: baseY - 6,
        duration: 180,
        yoyo: true,
        repeat: -1,
        delay: i * 90
      });
    });

    const prompt = this.add
      .text(cx, 540, 'PRESS SPACE TO RACE', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.35,
      duration: 600,
      yoyo: true,
      repeat: -1
    });

    this.add
      .text(cx, 620, 'A/D lanes  ·  W sprint  ·  S brake  ·  SPACE jump', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9bb6ff',
        align: 'center'
      })
      .setOrigin(0.5);

    this.add
      .text(cx, VIEW.height - 24, '25 racers per round  ·  3 laps  ·  obstacle course', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#6688bb'
      })
      .setOrigin(0.5);

    this.input.keyboard!.once('keydown-SPACE', () => {
      music.start();
      this.scene.start('VerifyScene');
    });
    this.input.keyboard!.on('keydown-M', () => music.toggleMute());
  }

  update(time: number) {
    const frame = Math.floor(time / 100) % 2;
    for (const sp of this.parade) {
      const c = sp.getData('color') as string;
      sp.setTexture(`runner_${c}_${frame}`);
    }
  }
}
