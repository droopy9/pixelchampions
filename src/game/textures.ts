import Phaser from 'phaser';

export type RunnerColor =
  | 'yellow' | 'red' | 'blue' | 'green'
  | 'purple' | 'orange' | 'cyan' | 'pink';

export const RUNNER_COLORS: RunnerColor[] = [
  'yellow', 'red', 'blue', 'green',
  'purple', 'orange', 'cyan', 'pink'
];

const RUNNER_W = 14;
const RUNNER_H = 20;

const PALETTE: Record<RunnerColor, { shirt: number; hat: number; pants: number; accent: number }> = {
  yellow: { shirt: 0xffcc33, hat: 0xff8800, pants: 0x4a3a1a, accent: 0xfff0a0 },
  red:    { shirt: 0xe6442a, hat: 0xa01b1b, pants: 0x3a1a1a, accent: 0xffb0a0 },
  blue:   { shirt: 0x3a7fd4, hat: 0x1f3b88, pants: 0x1a2a3a, accent: 0xa0c0ff },
  green:  { shirt: 0x4ec04e, hat: 0x1f7f1f, pants: 0x1a3a1a, accent: 0xb0ffb0 },
  purple: { shirt: 0xa040d0, hat: 0x602080, pants: 0x301840, accent: 0xe0a0ff },
  orange: { shirt: 0xff8838, hat: 0xc04000, pants: 0x402010, accent: 0xffd098 },
  cyan:   { shirt: 0x40c8d0, hat: 0x1a7080, pants: 0x103040, accent: 0xa0e8f0 },
  pink:   { shirt: 0xff88c0, hat: 0xc04880, pants: 0x402030, accent: 0xffd0e8 }
};

const SKIN = 0xf0c890;

export function ensureTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('runner_yellow_0')) return;
  generateRunners(scene);
  generateObstacles(scene);
  generateMisc(scene);
}

function generateRunners(scene: Phaser.Scene) {
  for (const color of RUNNER_COLORS) {
    const p = PALETTE[color];
    for (let frame = 0; frame < 3; frame++) {
      const g = scene.add.graphics();
      // hat band
      g.fillStyle(p.hat, 1);
      g.fillRect(3, 0, 8, 3);
      // head
      g.fillStyle(SKIN, 1);
      g.fillRect(4, 3, 6, 5);
      // hat brim shadow
      g.fillStyle(p.hat, 1);
      g.fillRect(3, 3, 8, 1);
      // body
      g.fillStyle(p.shirt, 1);
      g.fillRect(3, 8, 8, 7);
      // accent stripe
      g.fillStyle(p.accent, 1);
      g.fillRect(3, 11, 8, 1);
      // arms (swing opposite to legs)
      g.fillStyle(SKIN, 1);
      if (frame === 0) {
        g.fillRect(1, 9, 2, 5);
        g.fillRect(11, 10, 2, 4);
      } else if (frame === 2) {
        g.fillRect(1, 10, 2, 4);
        g.fillRect(11, 9, 2, 5);
      } else {
        // passing pose: arms close to body
        g.fillRect(2, 9, 2, 5);
        g.fillRect(10, 9, 2, 5);
      }
      // legs
      g.fillStyle(p.pants, 1);
      if (frame === 0) {
        // left forward / right back
        g.fillRect(3, 15, 3, 5);
        g.fillRect(8, 15, 3, 4);
      } else if (frame === 2) {
        // right forward / left back
        g.fillRect(4, 15, 3, 4);
        g.fillRect(7, 15, 3, 5);
      } else {
        // passing: both legs tucked under, slightly shorter
        g.fillRect(5, 15, 2, 4);
        g.fillRect(7, 15, 2, 4);
      }
      g.generateTexture(`runner_${color}_${frame}`, RUNNER_W, RUNNER_H);
      g.destroy();
    }
  }
}

function generateObstacles(scene: Phaser.Scene) {
  // moving block
  let g = scene.add.graphics();
  g.fillStyle(0x8a5a3a, 1);
  g.fillRect(0, 0, 90, 28);
  g.fillStyle(0xc88a5a, 1);
  g.fillRect(0, 0, 90, 6);
  g.fillStyle(0x4a2a1a, 1);
  g.fillRect(0, 24, 90, 4);
  for (let i = 8; i < 90; i += 18) {
    g.fillStyle(0x4a2a1a, 1);
    g.fillRect(i, 8, 2, 14);
  }
  g.generateTexture('block', 90, 28);
  g.destroy();

  // hammer bar
  g = scene.add.graphics();
  g.fillStyle(0x555555, 1);
  g.fillRect(0, 8, 120, 6);
  g.fillStyle(0x777777, 1);
  g.fillRect(0, 7, 120, 2);
  g.fillStyle(0xaa3333, 1);
  g.fillRect(108, 0, 22, 22);
  g.fillStyle(0xee5555, 1);
  g.fillRect(108, 0, 22, 4);
  g.fillStyle(0x000000, 1);
  g.fillRect(0, 8, 4, 6);
  g.generateTexture('hammer', 130, 22);
  g.destroy();

  // mud splat
  g = scene.add.graphics();
  g.fillStyle(0x6b4a2a, 1);
  g.fillRect(0, 0, 80, 80);
  g.fillStyle(0x4a3318, 1);
  const splats: [number, number, number, number][] = [
    [4, 6, 14, 6], [22, 12, 10, 6], [40, 4, 18, 8], [58, 14, 12, 6],
    [8, 24, 12, 6], [28, 28, 16, 6], [50, 26, 14, 6], [4, 42, 18, 6],
    [30, 44, 12, 6], [50, 42, 18, 6], [10, 58, 14, 6], [32, 62, 18, 6],
    [54, 60, 16, 6]
  ];
  for (const [x, y, w, h] of splats) g.fillRect(x, y, w, h);
  g.fillStyle(0x2a1810, 1);
  g.fillRect(20, 36, 4, 4);
  g.fillRect(48, 18, 4, 4);
  g.fillRect(60, 50, 4, 4);
  g.generateTexture('mud', 80, 80);
  g.destroy();

  // boost pad
  g = scene.add.graphics();
  g.fillStyle(0xffd633, 1);
  g.fillRect(0, 0, 60, 80);
  g.fillStyle(0xff8800, 1);
  g.fillTriangle(30, 8, 8, 36, 52, 36);
  g.fillRect(22, 36, 16, 32);
  g.fillStyle(0xfff8c0, 1);
  g.fillTriangle(30, 14, 14, 34, 46, 34);
  g.fillRect(24, 34, 12, 26);
  g.generateTexture('boost', 60, 80);
  g.destroy();

  // bumper
  g = scene.add.graphics();
  g.fillStyle(0x3a3aaa, 1);
  g.fillCircle(18, 18, 16);
  g.fillStyle(0x6a6ad4, 1);
  g.fillCircle(18, 18, 12);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(18, 18, 6);
  g.fillStyle(0xffd633, 1);
  g.fillCircle(18, 18, 3);
  g.generateTexture('bumper', 36, 36);
  g.destroy();

  // energy pickup (lightning bolt in a battery)
  g = scene.add.graphics();
  g.fillStyle(0x113366, 1);
  g.fillCircle(20, 20, 18);
  g.fillStyle(0x66ccff, 1);
  g.fillCircle(20, 20, 15);
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(15, 15, 4);
  // bolt
  g.fillStyle(0xffff66, 1);
  g.fillTriangle(24, 8, 12, 22, 20, 22);
  g.fillTriangle(20, 22, 28, 22, 16, 32);
  g.fillStyle(0xffffff, 1);
  g.fillRect(19, 19, 2, 4);
  g.generateTexture('energy', 40, 40);
  g.destroy();

  // spikes down (plate, dormant)
  g = scene.add.graphics();
  const sdW = 240;
  g.fillStyle(0x3a3a44, 1);
  g.fillRect(0, 4, sdW, 10);
  g.fillStyle(0x555566, 1);
  g.fillRect(0, 4, sdW, 2);
  g.fillStyle(0x1a1a22, 1);
  for (let i = 6; i < sdW; i += 12) g.fillRect(i, 8, 4, 4);
  g.generateTexture('spikes_down', sdW, 18);
  g.destroy();

  // spikes up (full row of sharp triangles — visually all red after tint)
  g = scene.add.graphics();
  const suW = 240;
  g.fillStyle(0xaa1010, 1);
  g.fillRect(0, 14, suW, 10);
  g.fillStyle(0xff5050, 1);
  g.fillRect(0, 14, suW, 3);
  g.fillStyle(0xff3030, 1);
  for (let i = 2; i < suW; i += 10) {
    g.fillTriangle(i, 14, i + 8, 14, i + 4, 0);
  }
  g.fillStyle(0xff9090, 1);
  for (let i = 6; i < suW; i += 10) g.fillRect(i, 4, 2, 2);
  g.generateTexture('spikes_up', suW, 24);
  g.destroy();

  // jump barrier — full track-width hazard beam with caution stripes
  g = scene.add.graphics();
  const beamW = 360;
  const beamH = 22;
  g.fillStyle(0x111111, 1);
  g.fillRect(0, 0, beamW, beamH);
  const stripe = 18;
  for (let i = 0; i < beamW; i += stripe * 2) {
    g.fillStyle(0xffcc33, 1);
    g.fillRect(i, 2, stripe, beamH - 4);
    g.fillStyle(0x111111, 1);
    g.fillRect(i + stripe, 2, stripe, beamH - 4);
  }
  g.fillStyle(0xff3333, 1);
  g.fillRect(0, 0, beamW, 2);
  g.fillRect(0, beamH - 2, beamW, 2);
  g.generateTexture('jumpbarrier', beamW, beamH);
  g.destroy();
}

function generateMisc(scene: Phaser.Scene) {
  // shadow ellipse
  let g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(10, 5, 18, 8);
  g.generateTexture('shadow', 20, 10);
  g.destroy();

  // banner across track
  g = scene.add.graphics();
  g.fillStyle(0xe83838, 1);
  g.fillRect(0, 0, 360, 28);
  g.fillStyle(0xfff8c0, 1);
  g.fillRect(0, 4, 360, 4);
  g.fillRect(0, 20, 360, 4);
  g.fillStyle(0x1a1a3a, 1);
  g.fillRect(150, 10, 8, 10);
  g.fillRect(170, 10, 8, 10);
  g.fillRect(190, 10, 8, 10);
  g.fillRect(210, 10, 8, 10);
  g.generateTexture('banner', 360, 28);
  g.destroy();

  // cone
  g = scene.add.graphics();
  g.fillStyle(0xff7722, 1);
  g.fillTriangle(8, 0, 0, 18, 16, 18);
  g.fillStyle(0xffffff, 1);
  g.fillRect(2, 10, 12, 3);
  g.fillStyle(0x884400, 1);
  g.fillRect(0, 17, 16, 3);
  g.generateTexture('cone', 16, 20);
  g.destroy();
}
