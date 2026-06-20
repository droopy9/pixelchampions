import Phaser from 'phaser';
import { VIEW } from '../game/constants';
import { ensureTextures } from '../game/textures';
import type { SessionData } from '../wallet/session';

const MOCK_SAMPLE_PUBKEY = '11111111111111111111111111111111';

interface UIButton {
  setEnabled(b: boolean): void;
}

function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  fill: number,
  textColor: string,
  onClick: () => void
): UIButton {
  const w = 280;
  const h = 38;
  const bg = scene.add
    .rectangle(x, y, w, h, fill, 1)
    .setStrokeStyle(2, 0xffffff, 0.9)
    .setOrigin(0.5);
  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: textColor,
      stroke: '#000000',
      strokeThickness: 2
    })
    .setOrigin(0.5);
  let enabled = true;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => { if (enabled) onClick(); });
  bg.on('pointerover', () => { if (enabled) bg.setStrokeStyle(3, 0xffcc33, 1); });
  bg.on('pointerout', () => bg.setStrokeStyle(2, 0xffffff, 0.9));
  return {
    setEnabled(b: boolean) {
      enabled = b;
      bg.setFillStyle(b ? fill : 0x2a2a3a, 1);
      text.setAlpha(b ? 1 : 0.5);
      if (bg.input) bg.input.cursor = b ? 'pointer' : 'not-allowed';
    }
  };
}

export class VerifyScene extends Phaser.Scene {
  private nicknameEl?: HTMLInputElement;
  private pubkeyEl?: HTMLInputElement;

  constructor() {
    super('VerifyScene');
  }

  create() {
    ensureTextures(this);
    this.cameras.main.setBackgroundColor('#1a2a4a');
    const cx = VIEW.width / 2;

    this.add
      .text(cx, 52, 'PIXEL\nCHAMPS', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#ffcc33',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 4,
        lineSpacing: -6
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 140, '[ ENTER YOUR DETAILS ]', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#aaccff'
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 180, 'NICKNAME', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9bb6ff'
      })
      .setOrigin(0.5);

    const nickDom = this.add.dom(
      cx,
      210,
      'input',
      'background:#0a1830;border:2px solid #4a6ab8;color:#fff;padding:8px 10px;' +
        'font-family:monospace;font-size:14px;width:220px;text-align:center;outline:none;'
    );
    this.nicknameEl = nickDom.node as HTMLInputElement;
    this.nicknameEl.setAttribute('placeholder', 'YOUR NAME');
    this.nicknameEl.setAttribute('maxlength', '12');
    this.nicknameEl.setAttribute('autocomplete', 'off');
    this.nicknameEl.value = '';

    this.add
      .text(cx, 254, 'WALLET PUBLIC KEY (for display only)', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9bb6ff'
      })
      .setOrigin(0.5);

    const pkDom = this.add.dom(
      cx,
      286,
      'input',
      'background:#0a1830;border:2px solid #4a6ab8;color:#fff;padding:8px 10px;' +
        'font-family:monospace;font-size:11px;width:340px;text-align:center;outline:none;letter-spacing:0.5px;'
    );
    this.pubkeyEl = pkDom.node as HTMLInputElement;
    this.pubkeyEl.setAttribute('placeholder', 'Paste your Solana wallet address...');
    this.pubkeyEl.setAttribute('maxlength', '48');
    this.pubkeyEl.setAttribute('autocomplete', 'off');
    this.pubkeyEl.setAttribute('spellcheck', 'false');
    this.pubkeyEl.value = '';

    makeButton(this, cx, 350, 'USE MOCK ADDRESS', 0xaa66cc, '#ffffff', () => {
      if (this.pubkeyEl) this.pubkeyEl.value = MOCK_SAMPLE_PUBKEY;
    });

    makeButton(this, cx, 420, '▶ JOIN LOBBY', 0xffcc33, '#000000', () => this.onJoin());

    this.add
      .text(cx, VIEW.height - 60, 'Multiplayer enabled  ·  no token check  ·  no payouts', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9bffd0'
      })
      .setOrigin(0.5);
    this.add
      .text(cx, VIEW.height - 24, 'Open another tab to test multiplayer.', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9bb6ff'
      })
      .setOrigin(0.5);
  }

  private onJoin() {
    const raw = this.nicknameEl?.value?.trim() || 'Player';
    const nickname = raw.slice(0, 12).toUpperCase();
    const pubkey = (this.pubkeyEl?.value ?? '').trim();
    if (!pubkey) {
      // Allow joining without a pubkey too, but tag it as mock so the UI knows.
    }
    const session: SessionData = {
      nickname,
      publicKey: pubkey || `MOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      isVerifiedHolder: false,
      isMockWallet: !pubkey
    };
    this.registry.set('session', session);
    this.registry.set('postRace', false);
    this.scene.start('LobbyScene');
  }
}
