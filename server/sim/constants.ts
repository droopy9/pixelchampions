// Server-side simulation constants — must mirror client visuals where they
// affect shared rendering, but are otherwise independent.

export const TRACK = {
  centerX: 1500,
  centerY: 1500,
  straightLength: 700,
  curveRadius: 380,
  width: 320
};

export const LANE_LATERAL = [-120, -40, 40, 120];
export const LANE_COUNT = LANE_LATERAL.length;

export const LAPS = 3;
export const TOTAL_RACERS = 25;

export const JUMP_DURATION = 500;
export const JUMP_COOLDOWN = 700;

export const LOBBY_FIRST_MS = 90_000;
export const LOBBY_NEXT_MS = 90_000;
export const RESULT_HOLD_MS = 15_000;

export const TICK_HZ = 30;
export const BROADCAST_HZ = 30;

export const COLORS = ['yellow', 'red', 'blue', 'green', 'purple', 'orange', 'cyan', 'pink'] as const;
export type RunnerColor = (typeof COLORS)[number];

export const BOT_NAMES: readonly string[] = [
  'WAGMI', 'PixelPunk', 'Speedy', 'RunnerX', 'ApeDash', 'Turbo', 'ChampBot',
  'HODLER', 'MoonRun', 'DegenJoe', 'Lambo', 'PumpKid', 'ShillBot', 'GMI',
  'Nitro', 'Blaze', 'Cipher', 'Rogue', 'Tank', 'Nova', 'Spark', 'Zeta',
  'Alpha', 'Bravo', 'Delta', 'Echo', 'Foxtrot', 'Hotel', 'Indigo', 'Juliet',
  'Kilo', 'Mike', 'Oscar', 'Sierra', 'Tango', 'Whiskey'
];
