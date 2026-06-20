import Phaser from 'phaser';
import { LANE_COUNT, TRACK } from './constants';
import type { Track } from './Track';
import type { Racer } from './Racer';

export abstract class Obstacle {
  scene: Phaser.Scene;
  track: Track;
  progress: number;
  jumpable = false;
  protected container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    container: Phaser.GameObjects.Container
  ) {
    this.scene = scene;
    this.track = track;
    this.progress = progress;
    this.container = container;
  }

  abstract update(time: number, racers: Racer[]): void;

  protected burst(x: number, y: number, color: number, count = 4, life = 320) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 14;
      const star = this.scene.add
        .rectangle(x, y, 3, 3, color, 1)
        .setDepth(y + 800);
      this.container.add(star);
      this.scene.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: life,
        onComplete: () => star.destroy()
      });
    }
  }

  protected flashSprite(sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, color: number, ms = 180) {
    sprite.setTintFill(color);
    this.scene.time.delayedCall(ms, () => sprite.clearTint());
  }
}

export class MudZone extends Obstacle {
  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    private lateral: number,
    private widthProgress: number,
    private widthLateral: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    this.jumpable = true;
    const tiles = Math.max(2, Math.ceil(widthProgress / 50));
    for (let i = 0; i < tiles; i++) {
      const dp = (i / (tiles - 1) - 0.5) * widthProgress;
      const pos = track.positionAt(progress + dp, lateral);
      const img = scene.add
        .image(pos.x, pos.y, 'mud')
        .setDisplaySize(widthLateral * 0.85, (widthProgress / tiles) * 1.4)
        .setRotation(pos.tangent + Math.PI / 2)
        .setDepth(pos.y - 200);
      container.add(img);
    }
  }

  update(time: number, racers: Racer[]) {
    for (const r of racers) {
      if (r.finished) continue;
      if (this.jumpable && r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      const dl = Math.abs(r.lateral - this.lateral);
      if (dp < this.widthProgress / 2 && dl < this.widthLateral / 2) {
        const wasInMud = time < r.mudUntil;
        r.mudUntil = time + 90;
        if (!wasInMud) {
          const pos = this.track.positionAt(r.progress, r.lateral);
          this.burst(pos.x, pos.y, 0x6b4a2a, 5, 280);
        }
      }
    }
  }
}

export class EnergyPickup extends Obstacle {
  private sprite: Phaser.GameObjects.Image;
  private available = true;
  private respawnAt = 0;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    private lateral: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    const pos = track.positionAt(progress, lateral);
    this.sprite = scene.add
      .image(pos.x, pos.y, 'energy')
      .setRotation(pos.tangent + Math.PI / 2)
      .setDepth(pos.y);
    container.add(this.sprite);
  }

  update(time: number, racers: Racer[]) {
    if (!this.available) {
      if (time >= this.respawnAt) {
        this.available = true;
        this.sprite.setAlpha(1);
        this.sprite.setScale(1);
      } else {
        this.sprite.setAlpha(0.25);
        return;
      }
    }

    const pulse = 1 + Math.sin(time / 180) * 0.08;
    this.sprite.setScale(pulse);

    for (const r of racers) {
      if (!r.isPlayer || r.finished) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      const dl = Math.abs(r.lateral - this.lateral);
      if (dp < 28 && dl < 36) {
        r.addEnergy(35);
        this.available = false;
        this.respawnAt = time + 3500;
        const sp = this.sprite;
        this.scene.tweens.add({
          targets: sp,
          scale: 1.7,
          alpha: 0.25,
          duration: 220,
          onComplete: () => {
            sp.setScale(1);
          }
        });
        break;
      }
    }
  }
}

export class SpikeTrap extends Obstacle {
  private sprite: Phaser.GameObjects.Image;
  private start: number;
  private active = false;
  private cycleMs = 2800;
  private activeMs = 900;
  private displayWidth: number;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    this.jumpable = true;
    this.displayWidth = TRACK.width + 20;
    const pos = track.positionAt(progress, 0);
    this.sprite = scene.add
      .image(pos.x, pos.y, 'spikes_down')
      .setDisplaySize(this.displayWidth, 18)
      .setRotation(pos.tangent + Math.PI / 2)
      .setDepth(pos.y + 5);
    container.add(this.sprite);
    this.start = scene.time.now;
  }

  update(time: number, racers: Racer[]) {
    const t = (time - this.start) % this.cycleMs;
    const nowActive = t < this.activeMs;
    if (nowActive !== this.active) {
      this.active = nowActive;
      this.sprite.setTexture(this.active ? 'spikes_up' : 'spikes_down');
      this.sprite.setDisplaySize(this.displayWidth, this.active ? 24 : 14);
      if (this.active) this.sprite.setTint(0xff3333);
      else this.sprite.clearTint();
    }
    if (!this.active) return;

    for (const r of racers) {
      if (r.finished || time < r.stunUntil) continue;
      if (r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      if (dp < 22) {
        r.stunUntil = time + 1000;
        r.boostRequested = false;
        r.boosting = false;
        this.flashSprite(this.sprite, 0xff3333, 220);
        const hitPos = this.track.positionAt(r.progress, r.lateral);
        this.burst(hitPos.x, hitPos.y, 0xff3333, 8, 380);
      }
    }
  }
}

export class MovingBlock extends Obstacle {
  private sprite: Phaser.GameObjects.Sprite;
  private start: number;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    private centerLateral: number,
    private range: number,
    private speed: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    this.jumpable = true;
    const pos = track.positionAt(progress, centerLateral);
    this.sprite = scene.add
      .sprite(pos.x, pos.y, 'block')
      .setRotation(pos.tangent + Math.PI / 2);
    container.add(this.sprite);
    this.start = scene.time.now;
  }

  update(time: number, racers: Racer[]) {
    const phase = Math.sin((time - this.start) * 0.001 * this.speed);
    const lat = this.centerLateral + phase * this.range;
    const pos = this.track.positionAt(this.progress, lat);
    this.sprite.setPosition(pos.x, pos.y);
    this.sprite.setRotation(pos.tangent + Math.PI / 2);
    this.sprite.setDepth(pos.y);

    for (const r of racers) {
      if (r.finished || time < r.stunUntil) continue;
      if (r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      const dl = Math.abs(r.lateral - lat);
      if (dp < 22 && dl < 48) {
        r.stunUntil = time + 500;
        r.boostRequested = false;
        r.boosting = false;
        this.flashSprite(this.sprite, 0xff6666, 150);
        this.burst(this.sprite.x, this.sprite.y, 0xff6666, 6, 300);
      }
    }
  }
}

export class SwingingHammer extends Obstacle {
  private sprite: Phaser.GameObjects.Sprite;
  private start: number;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    private pivotLateral: number,
    private armLength: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    this.jumpable = true;
    const pivotPos = track.positionAt(progress, pivotLateral);
    this.sprite = scene.add
      .sprite(pivotPos.x, pivotPos.y, 'hammer')
      .setOrigin(0, 0.5);
    container.add(this.sprite);
    this.start = scene.time.now;
  }

  update(time: number, racers: Racer[]) {
    const swingPhase = Math.sin((time - this.start) * 0.0022);
    const baseTangent = this.track.sample(this.progress).tangent;
    const perpAngle = baseTangent + Math.PI / 2;
    const pivotPos = this.track.positionAt(this.progress, this.pivotLateral);
    const tipLateral = this.pivotLateral + this.armLength * (0.5 + 0.5 * swingPhase);
    const tipPos = this.track.positionAt(this.progress, tipLateral);

    const armAngle = Math.atan2(tipPos.y - pivotPos.y, tipPos.x - pivotPos.x);
    this.sprite.setPosition(pivotPos.x, pivotPos.y);
    this.sprite.setRotation(armAngle);
    const visualLength = Math.hypot(tipPos.x - pivotPos.x, tipPos.y - pivotPos.y);
    this.sprite.setScale(visualLength / 130, 1);
    this.sprite.setDepth(pivotPos.y + 100);

    for (const r of racers) {
      if (r.finished || time < r.stunUntil) continue;
      if (r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      const dl = Math.abs(r.lateral - tipLateral);
      if (dp < 24 && dl < 26) {
        r.stunUntil = time + 420;
        const pushDir = r.lateral > tipLateral ? 1 : -1;
        if (pushDir > 0 && r.laneIndex < LANE_COUNT - 1) r.setLane(r.laneIndex + 1);
        else if (pushDir < 0 && r.laneIndex > 0) r.setLane(r.laneIndex - 1);
        this.burst(tipPos.x, tipPos.y, 0xffff66, 7, 350);
      }
    }
    // Silence unused-variable check for perpAngle (kept for potential future tweaks)
    void perpAngle;
  }
}

export class JumpBarrier extends Obstacle {
  private sprite: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    this.jumpable = true;
    const pos = track.positionAt(progress, 0);
    this.sprite = scene.add
      .image(pos.x, pos.y, 'jumpbarrier')
      .setDisplaySize(TRACK.width + 20, 20)
      .setRotation(pos.tangent + Math.PI / 2)
      .setDepth(pos.y + 10);
    container.add(this.sprite);
  }

  update(time: number, racers: Racer[]) {
    for (const r of racers) {
      if (r.finished) continue;
      if (r.isJumping(time)) continue;
      if (time < r.stunUntil) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      if (dp < 10) {
        r.progress -= 36;
        r.stunUntil = time + 350;
        // Reset jump cooldown so player can re-jump as soon as stun ends.
        r.jumpCooldownUntil = Math.min(r.jumpCooldownUntil, time + 300);
        r.boostRequested = false;
        r.boosting = false;
        this.flashSprite(this.sprite, 0xff6666, 220);
        const knockedPos = this.track.positionAt(r.progress, r.lateral);
        this.burst(knockedPos.x, knockedPos.y, 0xff8800, 7, 360);
        this.burst(knockedPos.x, knockedPos.y, 0xffffff, 4, 280);
      }
    }
  }
}

export class Cone extends Obstacle {
  private sprite: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    private lateral: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    this.jumpable = true;
    const pos = track.positionAt(progress, lateral);
    this.sprite = scene.add
      .image(pos.x, pos.y, 'cone')
      .setOrigin(0.5, 1)
      .setRotation(pos.tangent + Math.PI / 2)
      .setDepth(pos.y);
    container.add(this.sprite);
  }

  update(time: number, racers: Racer[]) {
    for (const r of racers) {
      if (r.finished || r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      const dl = Math.abs(r.lateral - this.lateral);
      if (dp < 12 && dl < 12) {
        r.brakeFactor = Math.min(r.brakeFactor, 0.55);
        if (this.sprite.scale > 0.7) {
          this.sprite.setScale(0.55);
          this.scene.tweens.add({ targets: this.sprite, scale: 1, duration: 220 });
          this.burst(this.sprite.x, this.sprite.y, 0xff8844, 4, 240);
        }
      }
    }
  }
}

export class Bumper extends Obstacle {
  private sprite: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    track: Track,
    progress: number,
    private lateral: number,
    container: Phaser.GameObjects.Container
  ) {
    super(scene, track, progress, container);
    const pos = track.positionAt(progress, lateral);
    this.sprite = scene.add.sprite(pos.x, pos.y, 'bumper').setDepth(pos.y);
    container.add(this.sprite);
  }

  update(_time: number, racers: Racer[]) {
    for (const r of racers) {
      if (r.finished) continue;
      const dp = this.track.progressDistance(r.progress, this.progress);
      const dl = r.lateral - this.lateral;
      if (dp * dp + dl * dl < 380) {
        const dir = dl >= 0 ? 1 : -1;
        if (dir > 0 && r.laneIndex < LANE_COUNT - 1) r.setLane(r.laneIndex + 1);
        else if (dir < 0 && r.laneIndex > 0) r.setLane(r.laneIndex - 1);
        r.brakeFactor = Math.min(r.brakeFactor, 0.6);
        if (this.sprite.scale < 1.2) {
          this.sprite.setScale(1.4);
          this.scene.tweens.add({ targets: this.sprite, scale: 1, duration: 180 });
          this.flashSprite(this.sprite, 0xffffff, 120);
          this.burst(this.sprite.x, this.sprite.y, 0xffd866, 5, 280);
        }
      }
    }
  }
}
