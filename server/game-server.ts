import express from 'express';
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { Track } from './sim/track';
import { Racer, type RacerInput } from './sim/racer';
import { ObstacleField, resolveRacerCollisions } from './sim/obstacles';
import {
  BOT_NAMES,
  COLORS,
  LANE_LATERAL,
  LAPS,
  LOBBY_FIRST_MS,
  LOBBY_NEXT_MS,
  RESULT_HOLD_MS,
  TICK_HZ,
  TOTAL_RACERS,
  TRACK,
  type RunnerColor
} from './sim/constants';

const PORT = Number(process.env.PORT || 3001);
const TICK_MS = 1000 / TICK_HZ;

type Phase = 'lobby' | 'countdown' | 'racing' | 'results';

interface ConnectedPlayer {
  id: string;
  nickname: string;
  publicKey: string;
}

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, phase, players: players.size }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const players = new Map<string, ConnectedPlayer>();
let phase: Phase = 'lobby';
let lobbyEndsAt = Date.now() + LOBBY_FIRST_MS;
let countdownStart = 0;
let raceStartTime = 0;
let resultEndsAt = 0;

let track: Track | null = null;
let racers: Racer[] = [];
let obstacles: ObstacleField | null = null;
let totalRaceLength = 0;
let pendingInputs = new Map<string, RacerInput>();
let lastResults: ResultPayload | null = null;
let raceWasFirst = true;

interface RacerSnap {
  id: string;
  name: string;
  color: RunnerColor;
  isBot: boolean;
  isLocalPlayer?: boolean;
  progress: number;
  lateral: number;
  worldX: number;
  worldY: number;
  forwardAngle: number;
  speed: number;
  energy: number;
  boosting: boolean;
  jumping: boolean;
  jumpStart: number | null;
  stunned: boolean;
  finished: boolean;
  laps: number;
  distance: number;
}

interface ResultPayload {
  ranking: { id: string; name: string; color: RunnerColor; finished: boolean; isBot: boolean }[];
  raceTimeMs: number;
  perimeter: number;
  totalRaceLength: number;
  winnerName: string;
  winnerColor: RunnerColor;
  winnerIsBot: boolean;
}

function estimateNextRaceAt(): number {
  const now = Date.now();
  if (phase === 'lobby') return lobbyEndsAt;
  if (phase === 'countdown') return countdownStart + 4 * 900;
  if (phase === 'racing') {
    // If at least one racer has crossed the finish, we know the result phase
    // is about to start (server gives a 2s grace). Otherwise pessimistically
    // assume the 3-min hard race cap is hit.
    const firstFinish = racers
      .filter(r => r.finishTime !== null)
      .reduce((m, r) => Math.min(m, r.finishTime as number), Number.POSITIVE_INFINITY);
    const raceEndsAt = firstFinish === Number.POSITIVE_INFINITY
      ? raceStartTime + 180_000
      : firstFinish + 2_000;
    return raceEndsAt + RESULT_HOLD_MS + LOBBY_NEXT_MS;
  }
  if (phase === 'results') return resultEndsAt + LOBBY_NEXT_MS;
  return now;
}

function broadcastLobby() {
  const remaining = Math.max(0, lobbyEndsAt - Date.now());
  io.emit('lobbyState', {
    phase,
    remainingMs: remaining,
    nextRaceAt: estimateNextRaceAt(),
    waitTotalMs: raceWasFirst ? LOBBY_FIRST_MS : LOBBY_NEXT_MS,
    players: Array.from(players.values()).map(p => ({
      id: p.id,
      nickname: p.nickname,
      publicKey: p.publicKey
    })),
    maxRacers: TOTAL_RACERS
  });
}

function startCountdown() {
  phase = 'countdown';
  countdownStart = Date.now();
  io.emit('countdownStart', { startedAt: countdownStart, durationMs: 4 * 900 });
}

function startRace() {
  track = new Track();
  totalRaceLength = track.perimeter * LAPS;
  raceStartTime = Date.now();
  obstacles = new ObstacleField(track, raceStartTime);

  const usableW = TRACK.width - 28;
  const spacing = usableW / (TOTAL_RACERS - 1);
  const startProgress = -6;

  // Real players first, bots fill remaining slots.
  const realPlayers = Array.from(players.values());
  const bots: { name: string; color: RunnerColor }[] = [];
  const botNamesShuffled = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const botCount = Math.max(0, TOTAL_RACERS - realPlayers.length);
  for (let i = 0; i < botCount; i++) {
    bots.push({
      name: botNamesShuffled[i % botNamesShuffled.length],
      color: COLORS[(realPlayers.length + i + 1) % COLORS.length]
    });
  }

  racers = [];
  for (let i = 0; i < TOTAL_RACERS; i++) {
    const lateral = -usableW / 2 + i * spacing;
    if (i < realPlayers.length) {
      const p = realPlayers[i];
      const color = i === 0 ? 'yellow' : COLORS[(i + 1) % COLORS.length];
      racers.push(new Racer(p.id, p.nickname, p.publicKey, color, false, track, lateral, startProgress));
    } else {
      const bot = bots[i - realPlayers.length];
      racers.push(
        new Racer(`bot_${i}`, bot.name, '', bot.color, true, track, lateral, startProgress)
      );
    }
  }

  phase = 'racing';
  io.emit('raceStart', {
    raceStartTime,
    perimeter: track.perimeter,
    totalRaceLength,
    laps: LAPS,
    racers: snapshot().racers
  });
}

function snapshot(): { time: number; raceTime: number; racers: RacerSnap[] } {
  const now = Date.now();
  const raceT = phase === 'racing' ? now - raceStartTime : 0;
  if (!track) return { time: now, raceTime: raceT, racers: [] };
  return {
    time: now,
    raceTime: raceT,
    racers: racers.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      isBot: r.isBot,
      progress: r.progress,
      lateral: r.lateral,
      worldX: r.worldX,
      worldY: r.worldY,
      forwardAngle: r.forwardAngle,
      speed: r.speed,
      energy: r.energy,
      boosting: r.boosting,
      jumping: r.isJumping(now),
      jumpStart: r.jumpStart,
      stunned: now < r.stunUntil,
      finished: r.finished,
      laps: r.lapsCompleted(track!.perimeter),
      distance: r.distance
    }))
  };
}

function finishRace() {
  if (!track) return;
  const ranked = [...racers].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.distance - a.distance;
  });
  const winner = ranked[0];
  lastResults = {
    ranking: ranked.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      finished: r.finished,
      isBot: r.isBot
    })),
    raceTimeMs: Date.now() - raceStartTime,
    perimeter: track.perimeter,
    totalRaceLength,
    winnerName: winner.name,
    winnerColor: winner.color,
    winnerIsBot: winner.isBot
  };
  io.emit('raceEnd', lastResults);
  phase = 'results';
  resultEndsAt = Date.now() + RESULT_HOLD_MS;
}

function returnToLobby() {
  phase = 'lobby';
  raceWasFirst = false;
  lobbyEndsAt = Date.now() + LOBBY_NEXT_MS;
  racers = [];
  obstacles = null;
  track = null;
  pendingInputs.clear();
  broadcastLobby();
}

io.on('connection', (socket: Socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('joinLobby', (data: { nickname?: string; publicKey?: string }) => {
    const nickname = (data?.nickname ?? 'Player').slice(0, 12).toUpperCase() || 'PLAYER';
    const publicKey = (data?.publicKey ?? '').slice(0, 48);
    if (players.has(socket.id)) {
      const existing = players.get(socket.id)!;
      existing.nickname = nickname;
      existing.publicKey = publicKey;
    } else {
      if (players.size >= TOTAL_RACERS) {
        socket.emit('joinRejected', { reason: 'Lobby full' });
        return;
      }
      players.set(socket.id, { id: socket.id, nickname, publicKey });
    }
    socket.emit('joinAccepted', { id: socket.id });
    broadcastLobby();
  });

  socket.on('input', (data: RacerInput) => {
    if (phase !== 'racing') return;
    if (!players.has(socket.id)) return;
    const prev = pendingInputs.get(socket.id) ?? {};
    pendingInputs.set(socket.id, { ...prev, ...data });
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    players.delete(socket.id);
    pendingInputs.delete(socket.id);
    if (phase === 'racing') {
      const r = racers.find(rc => rc.id === socket.id);
      if (r) {
        // Convert the player to a bot so the race continues smoothly.
        r.isBot = true;
        r.name = `${r.name} (left)`;
      }
    }
    broadcastLobby();
  });
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;

  if (phase === 'lobby') {
    if (now >= lobbyEndsAt) startCountdown();
  } else if (phase === 'countdown') {
    if (now - countdownStart >= 4 * 900) startRace();
  } else if (phase === 'racing' && track && obstacles) {
    // Apply pending inputs
    for (const r of racers) {
      if (r.isBot) {
        r.botAi(now);
      } else {
        const input = pendingInputs.get(r.id);
        if (input) {
          r.applyInput(input, now);
          // jump+lane edge events are one-shot
          if (input.jump) input.jump = false;
          if (input.laneLeft) input.laneLeft = false;
          if (input.laneRight) input.laneRight = false;
        }
      }
    }
    // Step physics
    for (const r of racers) r.step(now, dt, true, totalRaceLength, track);
    resolveRacerCollisions(racers, track);
    obstacles.update(now, racers);

    // Broadcast tick
    io.emit('raceTick', snapshot());

    // End condition: all racers done OR a hard cap
    const allDone = racers.every(r => r.finished);
    const tooLong = now - raceStartTime > 180_000;
    const localPlayerExists = racers.some(r => !r.isBot);
    const localFinished = racers.some(r => !r.isBot && r.finished);
    if (allDone || tooLong || (localFinished && now - raceStartTime > (racers.find(r => !r.isBot && r.finished)!.finishTime! - raceStartTime) + 2000)) {
      finishRace();
    } else if (!localPlayerExists) {
      // No human left; end whenever leader finishes.
      const leaderFinished = racers.some(r => r.finished);
      if (leaderFinished && now - raceStartTime > 5_000) finishRace();
    }
  } else if (phase === 'results') {
    if (now >= resultEndsAt) returnToLobby();
  }
}, TICK_MS);

// Periodic lobby broadcasts so the estimate keeps ticking for any client
// sitting in the lobby (including mid-race joiners who are waiting).
setInterval(() => broadcastLobby(), 500);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[pixel-champs server] listening on http://0.0.0.0:${PORT}`);
});
