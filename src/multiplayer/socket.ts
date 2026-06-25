import { io, Socket } from 'socket.io-client';
import type { RunnerColor } from '../game/textures';

export interface LobbyPlayer {
  id: string;
  nickname: string;
  publicKey: string;
  // null if the player is connected; otherwise ms left before their seat is
  // released and (if mid-race) handed to the bot AI.
  disconnectedRemainingMs: number | null;
}

export interface LobbyState {
  phase: 'lobby' | 'countdown' | 'racing' | 'results';
  remainingMs: number;
  nextRaceAt: number;
  waitTotalMs: number;
  players: LobbyPlayer[];
  maxRacers: number;
  lastResults?: {
    winnerName: string;
    winnerColor: RunnerColor;
    winnerIsBot: boolean;
    top3: { name: string; color: RunnerColor; isBot: boolean }[];
  } | null;
}

export interface RaceStartPayload {
  raceStartTime: number;
  perimeter: number;
  totalRaceLength: number;
  laps: number;
  racers: RacerSnap[];
}

export interface RacerSnap {
  id: string;
  name: string;
  color: RunnerColor;
  isBot: boolean;
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

export interface RaceTickPayload {
  time: number;
  raceTime: number;
  racers: RacerSnap[];
  pickups?: boolean[];
}

export interface RaceEndRanking {
  id: string;
  name: string;
  color: RunnerColor;
  finished: boolean;
  isBot: boolean;
}

export interface RaceEndPayload {
  ranking: RaceEndRanking[];
  raceTimeMs: number;
  perimeter: number;
  totalRaceLength: number;
  winnerName: string;
  winnerColor: RunnerColor;
  winnerIsBot: boolean;
}

const PLAYER_ID_KEY = 'pc.playerId';

function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const fresh = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(PLAYER_ID_KEY, fresh);
    return fresh;
  } catch {
    // localStorage unavailable (private mode etc.); fall back to ephemeral id
    return `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

class GameSocket {
  socket: Socket | null = null;
  myId: string = getOrCreatePlayerId();

  connect(): Socket {
    if (this.socket) return this.socket;
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    const serverUrl = env?.VITE_SERVER_URL || undefined;
    const opts = { transports: ['websocket', 'polling'], reconnection: true };
    this.socket = serverUrl ? io(serverUrl, opts) : io(opts);
    this.socket.on('connect', () => {
      console.log('[socket] connected', this.myId, 'via', serverUrl ?? 'same-origin');
    });
    this.socket.on('disconnect', () => {
      console.log('[socket] disconnected');
    });
    return this.socket;
  }

  joinLobby(nickname: string, publicKey: string) {
    this.connect().emit('joinLobby', { playerId: this.myId, nickname, publicKey });
  }

  sendInput(input: {
    laneLeft?: boolean;
    laneRight?: boolean;
    sprint?: boolean;
    brake?: boolean;
    jump?: boolean;
  }) {
    this.socket?.emit('input', input);
  }
}

export const gameSocket = new GameSocket();
