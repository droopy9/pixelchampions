export const VIEW = { width: 480, height: 720 };

export const TRACK = {
  centerX: 1500,
  centerY: 1500,
  straightLength: 700,
  curveRadius: 380,
  width: 320
};

export const LANE_COUNT = 4;
export const LANE_LATERAL = [-120, -40, 40, 120];

export const LAPS = 3;
export const TOTAL_RACERS = 25;

export const JUMP_DURATION = 500;
export const JUMP_COOLDOWN = 700;
export const JUMP_HEIGHT_SCALE = 0.4;

export const LOBBY_FIRST_MS = 90_000;
export const LOBBY_NEXT_MS = 90_000;
export const RESULT_HOLD_MS = 15_000;

export const PLAYER_FALLBACK_NAME = 'YOU';
export const BOT_NAMES: readonly string[] = [
  'WAGMI', 'PixelPunk', 'Speedy', 'RunnerX', 'ApeDash', 'Turbo', 'ChampBot',
  'HODLER', 'MoonRun', 'DegenJoe', 'Lambo', 'PumpKid', 'ShillBot', 'GMI',
  'Nitro', 'Blaze', 'Cipher', 'Rogue', 'Tank', 'Nova', 'Spark', 'Zeta',
  'Alpha', 'Bravo', 'Delta', 'Echo', 'Foxtrot', 'Hotel', 'Indigo', 'Juliet',
  'Kilo', 'Mike', 'Oscar', 'Sierra', 'Tango', 'Whiskey'
];

export const BANNER_MESSAGES = [
  'PIXEL',
  '1 SOL',
  'WAGMI',
  'HOLDERS',
  'RUN!',
  '100K',
  'S1 SOON'
];
