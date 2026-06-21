import { LANE_COUNT, LANE_LATERAL, TRACK } from './constants';
import { Track } from './track';
import { Racer } from './racer';

export type ObstacleType =
  | 'bumper'
  | 'cone'
  | 'mud'
  | 'block'
  | 'hammer'
  | 'spike'
  | 'jumpbarrier'
  | 'boost';

interface ObstacleSpec {
  type: ObstacleType;
  progress: number;
  lateral?: number;
  widthProgress?: number;
  widthLateral?: number;
  range?: number;
  speed?: number;
  pivotLateral?: number;
  armLength?: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The exact obstacle layout the offline client used. Server replicates the
 * collision logic; client renders them visually using the same `raceTime`
 * so visuals stay in sync without explicit obstacle-state broadcasts.
 */
export function buildObstacleSpecs(): ObstacleSpec[] {
  return [
    { type: 'cone', progress: 110, lateral: -60 },
    { type: 'cone', progress: 145, lateral: 20 },
    { type: 'cone', progress: 180, lateral: -60 },

    { type: 'mud', progress: 280, lateral: LANE_LATERAL[0], widthProgress: 120, widthLateral: 140 },
    { type: 'bumper', progress: 400, lateral: LANE_LATERAL[3] },
    { type: 'boost', progress: 470, lateral: 60 },
    { type: 'cone', progress: 540, lateral: -20 },

    { type: 'block', progress: 640, lateral: 0, range: 110, speed: 1.7 },
    { type: 'spike', progress: 780 },
    { type: 'boost', progress: 880, lateral: LANE_LATERAL[0] },

    { type: 'cone', progress: 970, lateral: -100 },
    { type: 'cone', progress: 1005, lateral: -40 },
    { type: 'cone', progress: 1040, lateral: 40 },
    { type: 'cone', progress: 1075, lateral: 100 },

    { type: 'hammer', progress: 1180, pivotLateral: -160, armLength: 220 },
    { type: 'bumper', progress: 1320, lateral: LANE_LATERAL[1] },
    { type: 'bumper', progress: 1360, lateral: LANE_LATERAL[2] },

    { type: 'mud', progress: 1500, lateral: LANE_LATERAL[3], widthProgress: 130, widthLateral: 130 },
    { type: 'boost', progress: 1620, lateral: LANE_LATERAL[2] },
    { type: 'jumpbarrier', progress: 1720 },

    { type: 'block', progress: 1820, lateral: 40, range: 140, speed: 2.3 },

    { type: 'cone', progress: 1940, lateral: 80 },
    { type: 'cone', progress: 1970, lateral: 0 },
    { type: 'cone', progress: 2000, lateral: -80 },

    { type: 'boost', progress: 2100, lateral: LANE_LATERAL[0] },
    { type: 'hammer', progress: 2300, pivotLateral: 160, armLength: -220 },

    { type: 'spike', progress: 2460 },
    { type: 'bumper', progress: 2580, lateral: LANE_LATERAL[2] },
    { type: 'bumper', progress: 2620, lateral: LANE_LATERAL[0] },

    { type: 'mud', progress: 2780, lateral: LANE_LATERAL[1], widthProgress: 110, widthLateral: 130 },
    { type: 'boost', progress: 2920, lateral: 0 },

    { type: 'block', progress: 3080, lateral: -30, range: 130, speed: 2.0 },
    { type: 'spike', progress: 3220 },
    { type: 'hammer', progress: 3360, pivotLateral: -160, armLength: 220 },

    { type: 'cone', progress: 3520, lateral: 0 },
    { type: 'cone', progress: 3550, lateral: 60 },
    { type: 'cone', progress: 3580, lateral: -60 }
  ];
}

// State that needs to survive across ticks for stateful obstacles
interface ObstacleState {
  // For energy pickups: per-pickup respawn time
  respawnAt?: number;
  // For block/hammer/spike: start time fixed at race start so timing is
  // deterministic for client visual sync
  startTime?: number;
}

export class ObstacleField {
  specs: ObstacleSpec[];
  state: ObstacleState[];
  raceStartTime: number;
  track: Track;

  constructor(track: Track, raceStartTime: number) {
    this.specs = buildObstacleSpecs();
    this.state = this.specs.map(() => ({}));
    this.raceStartTime = raceStartTime;
    this.track = track;
  }

  update(time: number, racers: Racer[]) {
    const t = time - this.raceStartTime;
    for (let i = 0; i < this.specs.length; i++) {
      const o = this.specs[i];
      const s = this.state[i];
      switch (o.type) {
        case 'bumper':
          this.updateBumper(o, racers);
          break;
        case 'cone':
          this.updateCone(o, racers, time);
          break;
        case 'mud':
          this.updateMud(o, racers, time);
          break;
        case 'block':
          this.updateBlock(o, racers, t, time);
          break;
        case 'hammer':
          this.updateHammer(o, racers, t, time);
          break;
        case 'spike':
          this.updateSpike(o, racers, t, time);
          break;
        case 'jumpbarrier':
          this.updateJumpBarrier(o, racers, time);
          break;
        case 'boost':
          this.updateBoostPickup(o, s, racers, time);
          break;
      }
    }
  }

  private updateBumper(o: ObstacleSpec, racers: Racer[]) {
    const lat = o.lateral ?? 0;
    for (const r of racers) {
      if (r.finished) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      const dl = r.lateral - lat;
      if (dp * dp + dl * dl < 380) {
        const dir = dl >= 0 ? 1 : -1;
        if (dir > 0 && r.laneIndex < LANE_COUNT - 1) r.setLane(r.laneIndex + 1);
        else if (dir < 0 && r.laneIndex > 0) r.setLane(r.laneIndex - 1);
        r.brakeFactor = Math.min(r.brakeFactor, 0.6);
      }
    }
  }

  private updateCone(o: ObstacleSpec, racers: Racer[], time: number) {
    const lat = o.lateral ?? 0;
    for (const r of racers) {
      if (r.finished || r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      const dl = Math.abs(r.lateral - lat);
      if (dp < 12 && dl < 12) r.brakeFactor = Math.min(r.brakeFactor, 0.55);
    }
  }

  private updateMud(o: ObstacleSpec, racers: Racer[], time: number) {
    const lat = o.lateral ?? 0;
    const wp = o.widthProgress ?? 100;
    const wl = o.widthLateral ?? 100;
    for (const r of racers) {
      if (r.finished || r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      const dl = Math.abs(r.lateral - lat);
      if (dp < wp / 2 && dl < wl / 2) r.mudUntil = time + 90;
    }
  }

  private updateBlock(o: ObstacleSpec, racers: Racer[], raceT: number, time: number) {
    const lat = (o.lateral ?? 0) + (o.range ?? 100) * Math.sin(raceT * 0.001 * (o.speed ?? 2));
    for (const r of racers) {
      if (r.finished || time < r.stunUntil || r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      const dl = Math.abs(r.lateral - lat);
      if (dp < 22 && dl < 48) {
        r.stunUntil = time + 500;
        r.boostRequested = false;
        r.boosting = false;
      }
    }
  }

  private updateHammer(o: ObstacleSpec, racers: Racer[], raceT: number, time: number) {
    const pivot = o.pivotLateral ?? 0;
    const arm = o.armLength ?? 200;
    const swing = Math.sin(raceT * 0.0022);
    const tipLateral = pivot + arm * (0.5 + 0.5 * swing);
    for (const r of racers) {
      if (r.finished || time < r.stunUntil || r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      const dl = Math.abs(r.lateral - tipLateral);
      if (dp < 24 && dl < 26) {
        r.stunUntil = time + 420;
        if (r.lateral > tipLateral && r.laneIndex < LANE_COUNT - 1) r.setLane(r.laneIndex + 1);
        else if (r.lateral < tipLateral && r.laneIndex > 0) r.setLane(r.laneIndex - 1);
      }
    }
  }

  private updateSpike(o: ObstacleSpec, racers: Racer[], raceT: number, time: number) {
    const cycleMs = 2800;
    const activeMs = 900;
    const phase = ((raceT % cycleMs) + cycleMs) % cycleMs;
    if (phase >= activeMs) return;
    for (const r of racers) {
      if (r.finished || time < r.stunUntil || r.isJumping(time)) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      if (dp < 22) {
        r.stunUntil = time + 1000;
        r.boostRequested = false;
        r.boosting = false;
      }
    }
  }

  private updateJumpBarrier(o: ObstacleSpec, racers: Racer[], time: number) {
    for (const r of racers) {
      if (r.finished || r.isJumping(time) || time < r.stunUntil) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      if (dp < 10) {
        r.progress -= 36;
        r.stunUntil = time + 350;
        r.jumpCooldownUntil = Math.min(r.jumpCooldownUntil, time + 300);
        r.boostRequested = false;
        r.boosting = false;
      }
    }
  }

  private updateBoostPickup(o: ObstacleSpec, s: ObstacleState, racers: Racer[], time: number) {
    if (s.respawnAt !== undefined && time < s.respawnAt) return;
    s.respawnAt = undefined;
    const lat = o.lateral ?? 0;
    for (const r of racers) {
      if (r.finished) continue;
      const dp = this.track.progressDistance(r.progress, o.progress);
      const dl = Math.abs(r.lateral - lat);
      if (dp < 28 && dl < 36) {
        r.addEnergy(35);
        s.respawnAt = time + 5000;
        break;
      }
    }
  }

  /**
   * Boolean availability per pickup, in the order pickups appear in
   * buildObstacleSpecs(). Client tracks pickups in the same order so the
   * arrays line up index-to-index.
   */
  getPickupStates(time: number): boolean[] {
    const out: boolean[] = [];
    for (let i = 0; i < this.specs.length; i++) {
      if (this.specs[i].type !== 'boost') continue;
      const s = this.state[i];
      const available = s.respawnAt === undefined || time >= s.respawnAt;
      out.push(available);
    }
    return out;
  }
}

export function resolveRacerCollisions(racers: Racer[], track: Track) {
  const NEAR_PROG = 14;
  const NEAR_LAT = 14;
  const halfMax = TRACK.width / 2 - 14;
  for (let i = 0; i < racers.length; i++) {
    const a = racers[i];
    if (a.finished) continue;
    for (let j = i + 1; j < racers.length; j++) {
      const b = racers[j];
      if (b.finished) continue;
      const dp = track.progressDistance(a.progress, b.progress);
      if (dp > NEAR_PROG) continue;
      const dl = b.lateral - a.lateral;
      const adl = Math.abs(dl);
      if (adl > NEAR_LAT) continue;
      const overlap = NEAR_LAT - adl;
      const push = overlap * 0.35;
      if (dl >= 0) {
        a.lateral = clamp(a.lateral - push, -halfMax, halfMax);
        b.lateral = clamp(b.lateral + push, -halfMax, halfMax);
      } else {
        a.lateral = clamp(a.lateral + push, -halfMax, halfMax);
        b.lateral = clamp(b.lateral - push, -halfMax, halfMax);
      }
      a.brakeFactor = Math.min(a.brakeFactor, 0.88);
      b.brakeFactor = Math.min(b.brakeFactor, 0.88);
    }
  }
}
