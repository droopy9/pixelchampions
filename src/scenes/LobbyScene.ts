import Phaser from 'phaser';
import { VIEW, TOTAL_RACERS } from '../game/constants';
import { ensureTextures, RUNNER_COLORS } from '../game/textures';
import { shortenPubkey } from '../wallet/auth';
import { music } from '../audio/music';
import type { SessionData } from '../wallet/session';
import { gameSocket, type LobbyState } from '../multiplayer/socket';

function fmt(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export class LobbyScene extends Phaser.Scene {
  private session: SessionData | null = null;
  private parade: Phaser.GameObjects.Sprite[] = [];
  private countdownText!: Phaser.GameObjects.Text;
  private slotsText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private playerListText!: Phaser.GameObjects.Text;
  private bgPulse?: Phaser.Tweens.Tween;
  private latest: LobbyState | null = null;
  private joined = false;
  private didMusicStart = false;
  private lastPhase: string | null = null;

  constructor() {
    super('LobbyScene');
  }

  create() {
    ensureTextures(this);
    this.cameras.main.setBackgroundColor('#1a2a4a');

    this.parade = [];
    this.bgPulse = undefined;
    this.latest = null;
    this.joined = false;
    this.lastPhase = null;

    this.session = (this.registry.get('session') as SessionData | undefined) ?? null;
    const cx = VIEW.width / 2;

    this.add
      .text(cx, 50, '[ LOBBY ]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#aaccff'
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 78, 'CONNECTING TO LIVE LOBBY', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9bb6ff'
      })
      .setOrigin(0.5);

    if (this.session) {
      this.add
        .text(cx, 116, `PLAYER: ${this.session.nickname}`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffcc33',
          stroke: '#000000',
          strokeThickness: 3
        })
        .setOrigin(0.5);
      const tag = this.session.isMockWallet ? 'MOCK' : 'WALLET';
      this.add
        .text(cx, 138, `${tag} ${shortenPubkey(this.session.publicKey)}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: this.session.isMockWallet ? '#cc99ff' : '#9bb6ff'
        })
        .setOrigin(0.5);
    }

    this.add
      .rectangle(cx, 230, 320, 110, 0x0a1830, 0.85)
      .setStrokeStyle(2, 0xffcc33, 0.7);
    this.add
      .text(cx, 198, 'ESTIMATED WAIT', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaccff'
      })
      .setOrigin(0.5);
    this.countdownText = this.add
      .text(cx, 238, '...', {
        fontFamily: 'monospace',
        fontSize: '54px',
        color: '#ffcc33',
        stroke: '#000000',
        strokeThickness: 6
      })
      .setOrigin(0.5);
    this.slotsText = this.add
      .text(cx, 278, `Players: 0 / ${TOTAL_RACERS}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9bffd0'
      })
      .setOrigin(0.5);

    const stripY = 350;
    const stripCount = 10;
    const stripeSpacing = 38;
    const startX = cx - ((stripCount - 1) * stripeSpacing) / 2;
    for (let i = 0; i < stripCount; i++) {
      const color = RUNNER_COLORS[i % RUNNER_COLORS.length];
      const sp = this.add
        .sprite(startX + i * stripeSpacing, stripY, `runner_${color}_0`)
        .setOrigin(0.5, 1)
        .setScale(2.4)
        .setData('color', color)
        .setData('phase', i * 0.4);
      this.parade.push(sp);
    }

    this.subText = this.add
      .text(cx, 396, 'Bots will fill empty slots when the race starts.', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9bb6ff',
        align: 'center',
        wordWrap: { width: 440 }
      })
      .setOrigin(0.5);

    this.playerListText = this.add
      .text(cx, 460, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 440 }
      })
      .setOrigin(0.5);

    this.add
      .text(cx, VIEW.height - 50, '◆ MULTIPLAYER LOBBY ◆', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9bffd0',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5);
    this.add
      .text(cx, VIEW.height - 24, 'Lobby starts automatically when timer hits 0', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#6688bb'
      })
      .setOrigin(0.5);

    this.input.keyboard!.on('keydown-M', () => music.toggleMute());

    this.bgPulse = this.tweens.add({
      targets: this.countdownText,
      scale: 1.08,
      duration: 500,
      yoyo: true,
      repeat: -1
    });

    this.connectAndJoin();
  }

  private connectAndJoin() {
    const socket = gameSocket.connect();

    // Start music on the first user gesture / scene entry.
    if (!this.didMusicStart) {
      music.start();
      this.didMusicStart = true;
    }

    if (this.session && socket.connected) {
      gameSocket.joinLobby(this.session.nickname, this.session.publicKey);
      this.joined = true;
    } else if (this.session) {
      socket.once('connect', () => {
        gameSocket.joinLobby(this.session!.nickname, this.session!.publicKey);
        this.joined = true;
      });
    }

    socket.off('lobbyState');
    socket.on('lobbyState', (state: LobbyState) => {
      this.latest = state;
      const prev = this.lastPhase;
      this.lastPhase = state.phase;
      // Only transition to the race if we were waiting in the lobby when
      // the next countdown began. Late joiners (mid-race) stay here.
      if (prev === 'lobby' && state.phase === 'countdown') {
        this.scene.start('RaceScene');
      } else if (prev === null && state.phase === 'countdown') {
        // Connected right at countdown — still join (server includes everyone
        // who was already in the player map).
        this.scene.start('RaceScene');
      }
    });
  }

  update(time: number) {
    try {
      this.runFrame(time);
    } catch (e) {
      console.error('[pixel-champs] lobby update error:', e);
    }
  }

  private runFrame(time: number) {
    if (this.latest) {
      const remaining = Math.max(0, this.latest.nextRaceAt - Date.now());
      this.countdownText.setText(fmt(remaining));
      if (remaining < 5_000) this.countdownText.setColor('#ff6666');
      else if (remaining < 15_000) this.countdownText.setColor('#ffaa33');
      else this.countdownText.setColor('#ffcc33');

      if (this.latest.phase === 'lobby') {
        this.subText.setText('Bots will fill empty slots when the race starts.');
        this.subText.setColor('#9bb6ff');
      } else {
        const msg =
          this.latest.phase === 'countdown' ? 'Race starting now…' :
          this.latest.phase === 'racing' ? 'RACE IN PROGRESS — estimated wait until next race' :
          'Race finished — next lobby opens in';
        this.subText.setText(msg);
        this.subText.setColor('#ffaa33');
      }

      const real = this.latest.players.length;
      const max = this.latest.maxRacers;
      const bots = Math.max(0, max - real);
      this.slotsText.setText(`Players: ${real} / ${max}  ·  ${bots} bot slots`);

      const list = this.latest.players
        .map(p => `${p.nickname}`)
        .join('  ·  ');
      this.playerListText.setText(list ? `In lobby:  ${list}` : 'Waiting for players to join…');
    }

    const frame = Math.floor(time / 90) % 2;
    for (const sp of this.parade) {
      if (!sp.active) continue;
      const c = sp.getData('color') as string;
      sp.setTexture(`runner_${c}_${frame}`);
      const phase = sp.getData('phase') as number;
      sp.y = 350 - 3 * Math.abs(Math.sin(time / 200 + phase));
    }

    void this.subText;
    void this.bgPulse;
    void this.joined;
  }
}
