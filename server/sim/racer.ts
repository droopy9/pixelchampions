import { LANE_LATERAL, LANE_COUNT, TRACK, JUMP_DURATION, JUMP_COOLDOWN, type RunnerColor } from './constants';
import { Track } from './track';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface RacerInput {
  laneLeft?: boolean;
  laneRight?: boolean;
  sprint?: boolean;
  brake?: boolean;
  jump?: boolean;
}

export class Racer {
  id: string;
  name: string;
  publicKey: string;
  color: RunnerColor;
  isBot: boolean;

  startProgress: number;
  progress: number;
  lateral: number;
  targetLateral: number;
  laneIndex: number;

  worldX = 0;
  worldY = 0;
  forwardAngle = 0;

  baseSpeed: number;
  speed = 0;
  energy: number;
  maxEnergy = 100;

  boostRequested = false;
  boosting = false;
  brakeRequested = false;
  brakeFactor = 1;

  stunUntil = 0;
  mudUntil = 0;
  jumpStart: number | null = null;
  jumpCooldownUntil = 0;

  finished = false;
  finishTime: number | null = null;

  nextBotLaneChange = 0;
  nextBotJumpCheck = 0;

  constructor(
    id: string,
    name: string,
    publicKey: string,
    color: RunnerColor,
    isBot: boolean,
    track: Track,
    initialLateral: number,
    startProgress: number
  ) {
    this.id = id;
    this.name = name;
    this.publicKey = publicKey;
    this.color = color;
    this.isBot = isBot;

    this.lateral = initialLateral;
    this.targetLateral = initialLateral;
    this.startProgress = startProgress;
    this.progress = startProgress;

    // Nearest lane
    let lane = 0;
    let minD = Infinity;
    for (let l = 0; l < LANE_COUNT; l++) {
      const d = Math.abs(initialLateral - LANE_LATERAL[l]);
      if (d < minD) { minD = d; lane = l; }
    }
    this.laneIndex = lane;

    this.baseSpeed = isBot ? 162 + Math.random() * 28 : 180;
    this.energy = isBot ? 0 : 50;

    const pos = track.positionAt(this.progress, this.lateral);
    this.worldX = pos.x;
    this.worldY = pos.y;
    this.forwardAngle = pos.tangent;
  }

  get distance(): number {
    return this.progress - this.startProgress;
  }

  lapsCompleted(perimeter: number): number {
    return Math.floor(this.distance / perimeter);
  }

  setLane(idx: number) {
    this.laneIndex = clamp(idx, 0, LANE_COUNT - 1);
    this.targetLateral = LANE_LATERAL[this.laneIndex];
  }

  tryJump(time: number): boolean {
    if (this.jumpStart !== null && time < this.jumpStart + JUMP_DURATION) return false;
    if (time < this.jumpCooldownUntil) return false;
    this.jumpStart = time;
    this.jumpCooldownUntil = time + JUMP_DURATION + JUMP_COOLDOWN;
    return true;
  }

  isJumping(time: number): boolean {
    return this.jumpStart !== null && time < this.jumpStart + JUMP_DURATION;
  }

  applyInput(input: RacerInput, time: number) {
    if (input.sprint !== undefined) this.boostRequested = input.sprint;
    if (input.brake !== undefined) this.brakeRequested = input.brake;
    if (input.laneLeft) this.setLane(this.laneIndex - 1);
    if (input.laneRight) this.setLane(this.laneIndex + 1);
    if (input.jump) this.tryJump(time);
  }

  botAi(time: number) {
    if (this.finished) return;
    if (time > this.nextBotLaneChange) {
      const dir = Math.random() < 0.5 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      if (dir !== 0) this.setLane(this.laneIndex + dir);
      this.nextBotLaneChange = time + 1600 + Math.random() * 1800;
    }
    if (time > this.nextBotJumpCheck) {
      this.nextBotJumpCheck = time + 250;
      if (Math.random() < 0.05) this.tryJump(time);
    }
  }

  step(time: number, dtMs: number, raceStarted: boolean, totalRaceLength: number, track: Track) {
    if (!this.finished && raceStarted) {
      const canBoost = this.boostRequested && this.energy > 0 && time >= this.stunUntil;
      this.boosting = canBoost;
      if (canBoost) this.energy = Math.max(0, this.energy - (dtMs / 1000) * 50);

      let s = this.baseSpeed;
      if (this.boosting) s *= 1.55;
      if (time < this.mudUntil) s *= 0.4;
      if (this.brakeRequested) this.brakeFactor = Math.min(this.brakeFactor, 0.55);
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
    this.brakeRequested = false;
    // boostRequested persists until next input event sets it

    this.lateral += (this.targetLateral - this.lateral) * 0.22;
    this.lateral = clamp(this.lateral, -TRACK.width / 2 + 14, TRACK.width / 2 - 14);

    const sampleP = raceStarted ? this.progress : this.startProgress;
    const pos = track.positionAt(sampleP, this.lateral);
    this.worldX = pos.x;
    this.worldY = pos.y;
    this.forwardAngle = pos.tangent;
  }

  addEnergy(amount: number) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }
}
