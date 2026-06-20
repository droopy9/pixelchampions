import { TRACK } from './constants';

export interface TrackPoint {
  x: number;
  y: number;
  tangent: number;
}

export class Track {
  readonly cx: number;
  readonly cy: number;
  readonly L: number;
  readonly R: number;
  readonly C: number;
  readonly perimeter: number;

  constructor() {
    this.cx = TRACK.centerX;
    this.cy = TRACK.centerY;
    this.L = TRACK.straightLength;
    this.R = TRACK.curveRadius;
    this.C = Math.PI * this.R;
    this.perimeter = 2 * this.L + 2 * this.C;
  }

  wrapProgress(p: number): number {
    const per = this.perimeter;
    return ((p % per) + per) % per;
  }

  sample(progress: number): TrackPoint {
    const p = this.wrapProgress(progress);
    const { cx, cy, L, R, C } = this;

    if (p < L) {
      return { x: cx - L / 2 + p, y: cy + R, tangent: 0 };
    }
    if (p < L + C) {
      const local = p - L;
      const angle = Math.PI / 2 - (local / C) * Math.PI;
      return {
        x: cx + L / 2 + R * Math.cos(angle),
        y: cy + R * Math.sin(angle),
        tangent: angle - Math.PI / 2
      };
    }
    if (p < 2 * L + C) {
      const local = p - L - C;
      return { x: cx + L / 2 - local, y: cy - R, tangent: Math.PI };
    }
    const local = p - 2 * L - C;
    const angle = -Math.PI / 2 - (local / C) * Math.PI;
    return {
      x: cx - L / 2 + R * Math.cos(angle),
      y: cy + R * Math.sin(angle),
      tangent: angle - Math.PI / 2
    };
  }

  positionAt(progress: number, lateral: number): TrackPoint {
    const tp = this.sample(progress);
    const perpX = Math.cos(tp.tangent + Math.PI / 2);
    const perpY = Math.sin(tp.tangent + Math.PI / 2);
    return {
      x: tp.x + perpX * lateral,
      y: tp.y + perpY * lateral,
      tangent: tp.tangent
    };
  }

  progressDistance(a: number, b: number): number {
    const per = this.perimeter;
    let d = Math.abs(this.wrapProgress(a) - this.wrapProgress(b));
    if (d > per / 2) d = per - d;
    return d;
  }
}
