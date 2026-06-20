import Phaser from 'phaser';
import { VIEW, RESULT_HOLD_MS } from '../game/constants';
import { ensureTextures } from '../game/textures';
import { shortenPubkey } from '../wallet/auth';
import { gameSocket, type RaceEndPayload } from '../multiplayer/socket';
import type { SessionData } from '../wallet/session';

const PLACE_COLORS = [
  '#ffcc33', '#dddddd', '#cd7f32', '#aaaaaa', '#999999',
  '#888888', '#777777', '#666666', '#555555', '#444444'
];

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}TH`;
  switch (n % 10) {
    case 1: return `${n}ST`;
    case 2: return `${n}ND`;
    case 3: return `${n}RD`;
    default: return `${n}TH`;
  }
}

function formatRaceTime(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export class ResultScene extends Phaser.Scene {
  private nextAt = 0;
  private nextLabel?: Phaser.GameObjects.Text;
  private goingToLobby = false;
  private spaceArmed = false;
  private rArmed = false;

  constructor() {
    super('ResultScene');
  }

  create(data: RaceEndPayload) {
    ensureTextures(this);
    this.cameras.main.setBackgroundColor('#1a2a4a');
    this.goingToLobby = false;
    this.spaceArmed = false;
    this.rArmed = false;

    const cx = VIEW.width / 2;
    const myId = gameSocket.myId;
    const playerIndex = data.ranking.findIndex(r => r.id === myId);
    const playerEntry = playerIndex >= 0 ? data.ranking[playerIndex] : null;
    const total = data.ranking.length;

    const title = !playerEntry
      ? 'SPECTATED'
      : playerIndex === 0 ? 'YOU WIN!'
      : playerIndex <= 2 ? `${ordinal(playerIndex + 1)} PLACE`
      : `${ordinal(playerIndex + 1)} OF ${total}`;
    const titleColor = !playerEntry ? '#aaccff' :
      playerIndex === 0 ? '#ffcc33' :
      playerIndex === 1 ? '#cccccc' :
      playerIndex === 2 ? '#cd7f32' :
      playerIndex >= total - 2 ? '#ff6666' : '#aaaaaa';

    this.add
      .text(cx, 28, '[ RACE SUMMARY ]', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9bb6ff'
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 60, title, {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: titleColor,
        stroke: '#000000',
        strokeThickness: 5
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        92,
        `★ WINNER: ${data.winnerName}${data.winnerIsBot ? '  (BOT)' : ''}`,
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffcc33',
          stroke: '#000000',
          strokeThickness: 3
        }
      )
      .setOrigin(0.5);

    this.add
      .text(cx, 110, `◆ TIME: ${formatRaceTime(data.raceTimeMs)}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9bffd0',
        stroke: '#000000',
        strokeThickness: 2
      })
      .setOrigin(0.5);

    const session = this.registry.get('session') as SessionData | undefined;
    if (session?.publicKey) {
      this.add
        .text(cx, 126, `${session.isMockWallet ? 'MOCK' : 'WALLET'} ${shortenPubkey(session.publicKey)}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: session.isMockWallet ? '#cc99ff' : '#9bb6ff'
        })
        .setOrigin(0.5);
    }

    // No-payout testing banner
    const bannerY = 168;
    this.add
      .rectangle(cx, bannerY, 460, 56, 0x162342, 1)
      .setStrokeStyle(3, 0x9bffd0, 0.85)
      .setOrigin(0.5);
    this.add
      .text(cx, bannerY - 12, '◆ TESTING MODE', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9bffd0',
        stroke: '#000000',
        strokeThickness: 2
      })
      .setOrigin(0.5);
    this.add
      .text(cx, bannerY + 12, 'No SOL payouts in test build', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
      })
      .setOrigin(0.5);

    // Leaderboard rows
    const visibleIdx: number[] = [];
    const topCount = Math.min(10, total);
    for (let i = 0; i < topCount; i++) visibleIdx.push(i);
    if (playerIndex >= topCount) visibleIdx.push(playerIndex);

    const rowHeight = 36;
    const rowsTop = 222;

    visibleIdx.forEach((idx, vIdx) => {
      const entry = data.ranking[idx];
      const isPlayer = idx === playerIndex;
      const place = idx + 1;
      const placeColor = idx < PLACE_COLORS.length ? PLACE_COLORS[idx] : '#666666';

      let y = rowsTop + vIdx * rowHeight;
      if (vIdx > 0 && idx !== visibleIdx[vIdx - 1] + 1) {
        this.add
          .text(cx, y - rowHeight / 2 + 4, '· · ·', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#9bb6ff'
          })
          .setOrigin(0.5);
        y += 12;
      }

      this.add
        .rectangle(cx, y, 420, rowHeight - 4, isPlayer ? 0x2a4a8a : 0x162342, 1)
        .setStrokeStyle(2, isPlayer ? 0xffcc33 : 0x3a4a6a)
        .setOrigin(0.5);

      this.add
        .text(cx - 195, y, ordinal(place), {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: placeColor,
          stroke: '#000000',
          strokeThickness: 3
        })
        .setOrigin(0, 0.5);

      this.add
        .sprite(cx - 60, y + 10, `runner_${entry.color}_1`)
        .setScale(1.6)
        .setOrigin(0.5, 1);

      const displayName = entry.name.length > 14 ? entry.name.slice(0, 14) : entry.name;
      this.add
        .text(cx - 32, y, displayName + (entry.isBot ? '' : '  ★'), {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: isPlayer ? '#ffcc33' : entry.isBot ? '#cccccc' : '#9bffd0'
        })
        .setOrigin(0, 0.5);

      if (isPlayer) {
        this.add
          .text(cx + 195, y, 'YOU', {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#ffcc33',
            backgroundColor: '#5a4a00',
            padding: { x: 4, y: 2 }
          })
          .setOrigin(1, 0.5);
      }
    });

    this.nextAt = this.time.now + RESULT_HOLD_MS;

    const btnY = VIEW.height - 60;
    const btnBg = this.add
      .rectangle(cx, btnY, 320, 44, 0xffcc33, 1)
      .setStrokeStyle(3, 0xffffff, 0.9)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, btnY, '▶ BACK TO LOBBY', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#000000'
      })
      .setOrigin(0.5);
    btnBg.on('pointerdown', () => this.toLobby());
    btnBg.on('pointerover', () => btnBg.setStrokeStyle(4, 0xffffff, 1));
    btnBg.on('pointerout', () => btnBg.setStrokeStyle(3, 0xffffff, 0.9));

    this.nextLabel = this.add
      .text(cx, VIEW.height - 22, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9bb6ff',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    kb.on('keyup-SPACE', () => { this.spaceArmed = true; });
    kb.on('keyup-R', () => { this.rArmed = true; });
    kb.on('keydown-SPACE', () => { if (this.spaceArmed) this.toLobby(); });
    kb.on('keydown-R', () => { if (this.rArmed) this.toLobby(); });
  }

  update(time: number) {
    try {
      if (this.goingToLobby) return;
      const remaining = Math.max(0, Math.ceil((this.nextAt - time) / 1000));
      if (this.nextLabel) {
        this.nextLabel.setText(`Auto-return to lobby in ${remaining}s   ·   release & press R / SPACE / click`);
      }
      if (time >= this.nextAt) this.toLobby();
    } catch (e) {
      console.error('[pixel-champs] result update error:', e);
    }
  }

  private toLobby() {
    if (this.goingToLobby) return;
    this.goingToLobby = true;
    this.registry.set('postRace', true);
    this.scene.start('LobbyScene');
  }
}
