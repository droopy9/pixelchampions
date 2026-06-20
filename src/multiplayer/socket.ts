import { io, Socket } from 'socket.io-client';
import type { RunnerColor } from '../game/textures';

export interface LobbyPlayer {
  id: string;
  nickname: string;
  publicKey: string;
}

export interface LobbyState {
  phase: 'lobby' | 'countdown' | 'racing' | 'results';
  remainingMs: number;
  waitTotalMs: number;
  players: LobbyPlayer[];
  maxRacers: number;
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

class GameSocket {
  socket: Socket | null = null;
  myId: string | null = null;

  connect(): Socket {
    if (this.socket) return this.socket;
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    const serverUrl = env?.VITE_SERVER_URL || undefined;
    const opts = { transports: ['websocket', 'polling'], reconnection: true };
    this.socket = serverUrl ? io(serverUrl, opts) : io(opts);
    this.socket.on('connect', () => {
      this.myId = this.socket?.id ?? null;
      console.log('[socket] connected', this.myId, 'via', serverUrl ?? 'same-origin');
    });
    this.socket.on('disconnect', () => {
      console.log('[socket] disconnected');
    });
    return this.socket;
  }

  joinLobby(nickname: string, publicKey: string) {
    this.connect().emit('joinLobby', { nickname, publicKey });
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
