import Phaser from 'phaser';
import {
  LANE_LATERAL,
  LANE_COUNT,
  TRACK,
  JUMP_DURATION,
  JUMP_COOLDOWN,
  JUMP_HEIGHT_SCALE
} from './constants';
import type { RunnerColor } from './textures';
import type { Track } from './Track';

export class Racer {
  scene: Phaser.Scene;
  track: Track;
  color: RunnerColor;
  isPlayer: boolean;
  name: string;

  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;

  worldX = 0;
  worldY = 0;
  forwardAngle = 0;

  startProgress: number;
  progress: number;
  lateral: number;
  laneIndex: number;
  targetLateral: number;

  baseSpeed: number;
  speed = 0;

  energy: number;
  maxEnergy = 100;
  boostRequested = false;
  boosting = false;

  stunUntil = 0;
  mudUntil = 0;
  brakeFactor = 1;

  jumpStart: number | null = null;
  jumpCooldownUntil = 0;

  finished = false;
  finishTime: number | null = null;

  nextBotLaneChange = 0;
  nextBotJumpCheck = 0;
  lastDustEmit = 0;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    color: RunnerColor,
    laneIndex: number,
    startProgress: number,
    isPlayer: boolean,
    name: string
  ) {
    this.scene = scene;
    this.track = track;
    this.color = color;
    this.isPlayer = isPlayer;
    this.name = name;

    this.laneIndex = laneIndex;
    this.lateral = LANE_LATERAL[laneIndex];
    this.targetLateral = this.lateral;

    this.startProgress = startProgress;
    this.progress = startProgress;

    this.baseSpeed = isPlayer ? 180 : 162 + Math.random() * 28;
    this.energy = isPlayer ? 50 : 0;

    const pos = track.positionAt(this.progress, this.lateral);
    this.worldX = pos.x;
    this.worldY = pos.y;
    this.forwardAngle = pos.tangent;

    this.shadow = scene.add.image(this.worldX, this.worldY, 'shadow');
    this.sprite = scene.add
      .sprite(this.worldX, this.worldY, `runner_${color}_0`)
      .setOrigin(0.5, 1);
    this.nameText = scene.add
      .text(this.worldX, this.worldY - 30, name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: isPlayer ? '#ffcc33' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2
      })
      .setOrigin(0.5, 1);
  }

  get distance(): number {
    return this.progress - this.startProgress;
  }

  get lapsCompleted(): number {
    return Math.floor(this.distance / this.track.perimeter);
  }

  setLane(idx: number) {
    this.laneIndex = Phaser.Math.Clamp(idx, 0, LANE_COUNT - 1);
    this.targetLateral = LANE_LATERAL[this.laneIndex];
  }

  applyPlayerInput(boost: boolean, brake: boolean, _time: number) {
    if (boost) this.boostRequested = true;
    if (brake) this.brakeFactor = 0.55;
  }

  addEnergy(amount: number) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }

  tryJump(time: number): boolean {
    if (this.isJumping(time)) return false;
    if (time < this.jumpCooldownUntil) return false;
    this.jumpStart = time;
    this.jumpCooldownUntil = time + JUMP_DURATION + JUMP_COOLDOWN;
    return true;
  }

  isJumping(time: number): boolean {
    return this.jumpStart !== null && time < this.jumpStart + JUMP_DURATION;
  }

  applyBotAI(time: number) {
    if (this.finished) return;
    if (time > this.nextBotLaneChange) {
      const dir = Phaser.Math.Between(-1, 1);
      if (dir !== 0) this.setLane(this.laneIndex + dir);
      this.nextBotLaneChange = time + Phaser.Math.Between(1600, 3400);
    }
    if (time > this.nextBotJumpCheck) {
      this.nextBotJumpCheck = time + 250;
      if (Math.random() < 0.05) this.tryJump(time);
    }
  }

  update(time: number, dtMs: number, raceStarted: boolean, totalRaceLength: number) {
    if (!this.finished && raceStarted) {
      const canBoost = this.boostRequested && this.energy > 0 && time >= this.stunUntil;
      this.boosting = canBoost;
      if (canBoost) {
        this.energy = Math.max(0, this.energy - (dtMs / 1000) * 50);
      }

      let s = this.baseSpeed;
      if (this.boosting) s *= 1.55;
      if (time < this.mudUntil) s *= 0.4;
      s *= this.brakeFactor;
      if (time < this.stunUntil) s = 0;

      this.speed = s;
      this.progress += (s * dtMs) / 1000;

      if (this.distance >= totalRaceLength) {
        this.progress = this.startProgress + totalRaceLength;
        this.finished = true;
        this.finishTime = time;
      }
    }

    this.brakeFactor = 1;
    this.boostRequested = false;

    this.lateral += (this.targetLateral - this.lateral) * 0.22;
    this.lateral = Phaser.Math.Clamp(
      this.lateral,
      -TRACK.width / 2 + 14,
      TRACK.width / 2 - 14
    );

    const sampleP = raceStarted ? this.progress : this.startProgress;
    const pos = this.track.positionAt(sampleP, this.lateral);
    this.worldX = pos.x;
    this.worldY = pos.y;
    this.forwardAngle = pos.tangent;

    const RUN_CYCLE: number[] = [0, 1, 2, 1];
    const step = Math.floor(time / 70) % RUN_CYCLE.length;
    const frame = this.finished ? 1 : RUN_CYCLE[step];
    this.sprite.setTexture(`runner_${this.color}_${frame}`);

    this.sprite.setPosition(this.worldX, this.worldY);
    this.shadow.setPosition(this.worldX, this.worldY - 2);

    const lateralPull = this.targetLateral - this.lateral;
    const lean = Phaser.Math.Clamp(lateralPull * 0.012, -0.32, 0.32);
    const spriteRot = this.forwardAngle + Math.PI / 2 + lean;
    this.sprite.setRotation(spriteRot);
    this.shadow.setRotation(this.forwardAngle + Math.PI / 2);

    let scale = 1;
    let shadowScale = 1;
    if (this.isJumping(time)) {
      const t = (time - (this.jumpStart ?? 0)) / JUMP_DURATION;
      const jumpFrac = Math.sin(t * Math.PI);
      scale = 1 + jumpFrac * JUMP_HEIGHT_SCALE;
      shadowScale = 1 - jumpFrac * 0.55;
    }

    this.sprite.setScale(scale);
    this.shadow.setScale(shadowScale, shadowScale * 0.6);

    const baseDepth = this.worldY;
    this.sprite.setDepth(baseDepth + (this.isJumping(time) ? 1000 : 0));
    this.shadow.setDepth(baseDepth - 0.5);

    if (time < this.stunUntil) {
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
}
