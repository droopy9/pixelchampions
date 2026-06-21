import Phaser from 'phaser';
import { VIEW, TRACK, LANE_LATERAL, LAPS, TOTAL_RACERS, BANNER_MESSAGES } from '../game/constants';
import { ensureTextures, type RunnerColor } from '../game/textures';
import { Track } from '../game/Track';
import {
  Obstacle,
  MudZone,
  MovingBlock,
  SwingingHammer,
  EnergyPickup,
  SpikeTrap,
  Bumper,
  Cone,
  JumpBarrier
} from '../game/Obstacle';
import { music } from '../audio/music';
import { gameSocket, type RaceStartPayload, type RaceTickPayload, type RaceEndPayload } from '../multiplayer/socket';
import { RacerView } from '../multiplayer/RacerView';

const PLAYER_SCREEN_Y = 540;
const COLOR_HEX: Record<RunnerColor, number> = {
  yellow: 0xffcc33,
  red: 0xe6442a,
  blue: 0x3a7fd4,
  green: 0x4ec04e,
  purple: 0xa040d0,
  orange: 0xff8838,
  cyan: 0x40c8d0,
  pink: 0xff88c0
};
const STANDINGS_ROWS = 7;

function ordSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
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

export class RaceScene extends Phaser.Scene {
  private track!: Track;
  private worldContainer!: Phaser.GameObjects.Container;
  private cameraRotation = 0;

  private racers = new Map<string, RacerView>();
  private racerOrderById: string[] = [];
  private localPlayer: RacerView | null = null;
  private obstacles: Obstacle[] = [];
  private pickups: EnergyPickup[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  private raceStarted = false;
  private serverRaceStartTime = 0;
  private serverTotalRaceLength = 0;

  private lastSprint = false;
  private lastBrake = false;
  private shownLap = 0;

  private posText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private energyLabel!: Phaser.GameObjects.Text;
  private energyFill!: Phaser.GameObjects.Rectangle;
  private timerText!: Phaser.GameObjects.Text;
  private standingsRows: Phaser.GameObjects.Text[] = [];
  private countdownText?: Phaser.GameObjects.Text;
  private lapFlashText?: Phaser.GameObjects.Text;
  private progressBg!: Phaser.GameObjects.Rectangle;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private racerDots: Phaser.GameObjects.Rectangle[] = [];
  private waitingText?: Phaser.GameObjects.Text;

  constructor() {
    super('RaceScene');
  }

  create() {
    ensureTextures(this);

    this.cameras.main.setBackgroundColor('#2c7a2c');
    this.track = new Track();
    this.serverTotalRaceLength = this.track.perimeter * LAPS;

    this.racers = new Map();
    this.racerOrderById = [];
    this.standingsRows = [];
    this.racerDots = [];
    this.localPlayer = null;
    this.obstacles = [];
    this.pickups = [];
    this.raceStarted = false;
    this.shownLap = 0;
    this.lastSprint = false;
    this.lastBrake = false;

    this.worldContainer = this.add.container(0, 0);
    this.drawTrack();
    this.spawnObstacles();
    this.createInput();
    this.createHud();

    this.waitingText = this.add
      .text(VIEW.width / 2, 360, 'WAITING FOR SERVER...', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffcc33',
        stroke: '#000000',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30000);

    this.attachSocketHandlers();
    this.startCountdownVisual();
  }

  // ---- Network ----

  private attachSocketHandlers() {
    const socket = gameSocket.connect();
    socket.removeAllListeners('raceStart');
    socket.removeAllListeners('raceTick');
    socket.removeAllListeners('raceEnd');

    socket.on('raceStart', (payload: RaceStartPayload) => {
      if (!this.scene.isActive()) return;
      this.serverRaceStartTime = payload.raceStartTime;
      this.serverTotalRaceLength = payload.totalRaceLength;
      // Initialise/refresh obstacle "start" so visual timing aligns with server
      for (const o of this.obstacles) (o as unknown as { start?: number }).start = payload.raceStartTime;
      this.buildRacers(payload.racers);
      this.raceStarted = true;
      this.waitingText?.destroy();
      this.waitingText = undefined;
    });

    socket.on('raceTick', (payload: RaceTickPayload) => {
      if (!this.scene.isActive()) return;
      if (!this.raceStarted) {
        // First tick may arrive before raceStart for late joiners
        this.serverRaceStartTime = payload.time - payload.raceTime;
        for (const o of this.obstacles) (o as unknown as { start?: number }).start = this.serverRaceStartTime;
        this.buildRacers(payload.racers);
        this.raceStarted = true;
        this.waitingText?.destroy();
        this.waitingText = undefined;
      }
      if (payload.pickups) {
        for (let i = 0; i < payload.pickups.length && i < this.pickups.length; i++) {
          this.pickups[i].setAvailable(payload.pickups[i]);
        }
      }
      const now = performance.now();
      for (const snap of payload.racers) {
        const v = this.racers.get(snap.id);
        if (!v) {
          // New racer mid-race? Build it.
          const isLocal = snap.id === gameSocket.myId;
          const nv = new RacerView(this, snap, isLocal);
          this.worldContainer.add([nv.shadow, nv.sprite, nv.nameText]);
          this.racers.set(snap.id, nv);
          this.racerOrderById.push(snap.id);
          if (isLocal) this.localPlayer = nv;
          nv.applySnap(snap, now);
        } else {
          v.applySnap(snap, now);
        }
      }
    });

    socket.on('raceEnd', (payload: RaceEndPayload) => {
      if (!this.scene.isActive()) return;
      this.registry.set('postRace', true);
      this.scene.start('ResultScene', payload);
    });
  }

  private buildRacers(racers: RaceTickPayload['racers']) {
    // Wipe any existing views from a prior race
    for (const v of this.racers.values()) v.destroy();
    this.racers.clear();
    this.racerOrderById = [];
    this.localPlayer = null;

    for (const snap of racers) {
      const isLocal = snap.id === gameSocket.myId;
      const v = new RacerView(this, snap, isLocal);
      this.worldContainer.add([v.shadow, v.sprite, v.nameText]);
      this.racers.set(snap.id, v);
      this.racerOrderById.push(snap.id);
      if (isLocal) this.localPlayer = v;
    }

    // Build dots after racers exist
    this.buildRacerDots();
  }

  private buildRacerDots() {
    // Tear down old dots
    for (const d of this.racerDots) d.destroy();
    this.racerDots = [];
    const barX = VIEW.width - 24;
    const barBottomY = 670;
    let idx = 0;
    for (const id of this.racerOrderById) {
      const v = this.racers.get(id)!;
      const xOffset = v.isLocalPlayer ? 0 : idx % 2 === 0 ? -9 : 9;
      const dot = this.add
        .rectangle(
          barX + xOffset,
          barBottomY,
          v.isLocalPlayer ? 7 : 4,
          v.isLocalPlayer ? 7 : 4,
          COLOR_HEX[v.color]
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(v.isLocalPlayer ? 20003 : 20002);
      if (v.isLocalPlayer) dot.setStrokeStyle(1, 0xffffff, 1);
      this.racerDots.push(dot);
      idx++;
    }
  }

  // ---- Frame loop ----

  update(_time: number, dt: number) {
    try {
      this.runFrame(dt);
    } catch (e) {
      console.error('[pixel-champs] race update error:', e);
    }
  }

  private runFrame(dt: number) {
    const now = performance.now();

    // Read controls and ship state-deltas to server
    if (this.raceStarted && this.localPlayer && !this.localPlayer.finished) {
      const sprint = this.wasd.W.isDown || this.cursors.up.isDown;
      const brake = this.wasd.S.isDown || this.cursors.down.isDown;
      if (sprint !== this.lastSprint || brake !== this.lastBrake) {
        gameSocket.sendInput({ sprint, brake });
        this.lastSprint = sprint;
        this.lastBrake = brake;
      }
    }

    // Render racers
    for (const v of this.racers.values()) v.render(now);

    // Render obstacles using server's race start time so visuals align
    const wallTime = Date.now();
    for (const o of this.obstacles) o.update(wallTime, []);

    // Camera follow / rotate
    if (this.localPlayer) {
      const targetRot = -this.localPlayer.forwardAngle - Math.PI / 2;
      this.cameraRotation = Phaser.Math.Angle.RotateTo(
        this.cameraRotation,
        targetRot,
        (dt / 1000) * 3.5
      );
      this.updateWorldTransform();
      this.updateRacerNames();
    }

    this.worldContainer.sort('depth');
    this.updateHud(now);
  }

  private updateWorldTransform() {
    if (!this.localPlayer) return;
    const θ = this.cameraRotation;
    const cosθ = Math.cos(θ);
    const sinθ = Math.sin(θ);
    const px = this.localPlayer.worldX;
    const py = this.localPlayer.worldY;
    const tx = VIEW.width / 2 - (cosθ * px - sinθ * py);
    const ty = PLAYER_SCREEN_Y - (sinθ * px + cosθ * py);
    this.worldContainer.setPosition(tx, ty);
    this.worldContainer.setRotation(θ);
  }

  private updateRacerNames() {
    const θ = this.cameraRotation;
    const sinθ = Math.sin(θ);
    const cosθ = Math.cos(θ);
    const offsetH = 28;
    for (const v of this.racers.values()) {
      v.nameText.x = v.worldX - offsetH * sinθ;
      v.nameText.y = v.worldY - offsetH * cosθ;
      v.nameText.rotation = -θ;
      v.nameText.setDepth(v.worldY + 60);
    }
  }

  // ---- Track + obstacle visuals ----

  private drawTrack() {
    const halfW = TRACK.width / 2;
    const barrierW = 12;
    const perim = this.track.perimeter;
    const samples = 240;

    const grass = this.add.graphics().setDepth(-3000);
    grass.fillStyle(0x3a9a3a, 1);
    grass.fillRect(
      this.track.cx - this.track.L / 2 - this.track.R - 800,
      this.track.cy - this.track.R - 800,
      this.track.L + 2 * this.track.R + 1600,
      2 * this.track.R + 1600
    );
    this.worldContainer.add(grass);

    const crowdG = this.add.graphics().setDepth(-2500);
    const rng = new Phaser.Math.RandomDataGenerator(['pixelchamps-circuit']);
    const crowdColors = [0xff3333, 0xffcc33, 0x33cc66, 0x33ccff, 0xff66cc, 0xffffff, 0xff9933, 0xcc66ff];
    for (let i = 0; i < 2200; i++) {
      const sample = rng.realInRange(0, perim);
      const side = rng.integerInRange(0, 1) === 0 ? -1 : 1;
      const radial = side * rng.realInRange(halfW + barrierW + 8, halfW + barrierW + 240);
      const pos = this.track.positionAt(sample, radial);
      crowdG.fillStyle(crowdColors[rng.integerInRange(0, crowdColors.length - 1)], 1);
      crowdG.fillRect(pos.x, pos.y, 3, 3);
    }
    this.worldContainer.add(crowdG);

    const trackG = this.add.graphics().setDepth(-2000);
    trackG.fillStyle(0xd4a96a, 1);
    let prevL = this.track.positionAt(0, -halfW);
    let prevR = this.track.positionAt(0, halfW);
    for (let i = 1; i <= samples; i++) {
      const p = (i / samples) * perim;
      const curL = this.track.positionAt(p, -halfW);
      const curR = this.track.positionAt(p, halfW);
      trackG.fillTriangle(prevL.x, prevL.y, prevR.x, prevR.y, curR.x, curR.y);
      trackG.fillTriangle(prevL.x, prevL.y, curR.x, curR.y, curL.x, curL.y);
      prevL = curL;
      prevR = curR;
    }
    this.worldContainer.add(trackG);

    const stripeG = this.add.graphics().setDepth(-1900);
    stripeG.fillStyle(0xffffff, 0.85);
    for (const lat of [-80, 0, 80]) {
      for (let i = 0; i < samples; i++) {
        if (i % 2 !== 0) continue;
        const p = (i / samples) * perim;
        const pos = this.track.positionAt(p, lat);
        stripeG.fillRect(pos.x - 2, pos.y - 2, 4, 4);
      }
    }
    this.worldContainer.add(stripeG);

    const barrierG = this.add.graphics().setDepth(-1850);
    for (let i = 0; i < samples; i++) {
      const p = (i / samples) * perim;
      const odd = i % 2 === 0;
      const leftEdge = this.track.positionAt(p, -halfW - barrierW);
      const rightEdge = this.track.positionAt(p, halfW + barrierW);
      barrierG.fillStyle(odd ? 0xee3333 : 0xffffff, 1);
      barrierG.fillRect(leftEdge.x - 6, leftEdge.y - 6, 12, 12);
      barrierG.fillRect(rightEdge.x - 6, rightEdge.y - 6, 12, 12);
    }
    this.worldContainer.add(barrierG);

    const sideOffset = halfW + 130;
    for (let i = 0; i < BANNER_MESSAGES.length; i++) {
      const p = (i / BANNER_MESSAGES.length) * perim + 80;
      const side = i % 2 === 0 ? -1 : 1;
      const pos = this.track.positionAt(p, side * sideOffset);
      const rot = pos.tangent + Math.PI / 2;
      const banner = this.add
        .image(pos.x, pos.y, 'banner')
        .setDisplaySize(110, 22)
        .setRotation(rot)
        .setDepth(-1500);
      const txt = this.add
        .text(pos.x, pos.y, BANNER_MESSAGES[i], {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#fff8c0',
          stroke: '#7a1a1a',
          strokeThickness: 3,
          resolution: 2
        })
        .setOrigin(0.5)
        .setRotation(rot)
        .setDepth(-1499);
      this.worldContainer.add([banner, txt]);
    }

    // Start/finish checker
    const finishG = this.add.graphics().setDepth(-1700);
    const checkers = 8;
    const cellW = TRACK.width / checkers;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < checkers; col++) {
        const lat = -halfW + col * cellW + cellW / 2;
        const dp = (row - 1) * 12;
        const pos = this.track.positionAt(dp, lat);
        const c = (row + col) % 2 === 0 ? 0xffffff : 0x111111;
        finishG.fillStyle(c, 1);
        const halfCell = cellW / 2;
        const cosT = Math.cos(pos.tangent + Math.PI / 2);
        const sinT = Math.sin(pos.tangent + Math.PI / 2);
        const x1 = pos.x - cosT * halfCell;
        const y1 = pos.y - sinT * halfCell;
        const x2 = pos.x + cosT * halfCell;
        const y2 = pos.y + sinT * halfCell;
        const fx = Math.cos(pos.tangent);
        const fy = Math.sin(pos.tangent);
        const x3 = x2 + fx * 12;
        const y3 = y2 + fy * 12;
        const x4 = x1 + fx * 12;
        const y4 = y1 + fy * 12;
        finishG.fillTriangle(x1, y1, x2, y2, x3, y3);
        finishG.fillTriangle(x1, y1, x3, y3, x4, y4);
      }
    }
    this.worldContainer.add(finishG);
  }

  private addPickup(p: EnergyPickup) {
    this.obstacles.push(p);
    this.pickups.push(p);
  }

  private spawnObstacles() {
    const cont = this.worldContainer;
    const t = this.track;

    this.obstacles.push(new Cone(this, t, 110, -60, cont));
    this.obstacles.push(new Cone(this, t, 145, 20, cont));
    this.obstacles.push(new Cone(this, t, 180, -60, cont));

    this.obstacles.push(new MudZone(this, t, 280, LANE_LATERAL[0], 120, 140, cont));
    this.obstacles.push(new Bumper(this, t, 400, LANE_LATERAL[3], cont));
    this.addPickup(new EnergyPickup(this, t, 470, 60, cont));
    this.obstacles.push(new Cone(this, t, 540, -20, cont));

    this.obstacles.push(new MovingBlock(this, t, 640, 0, 110, 1.7, cont));
    this.obstacles.push(new SpikeTrap(this, t, 780, cont));
    this.addPickup(new EnergyPickup(this, t, 880, LANE_LATERAL[0], cont));

    this.obstacles.push(new Cone(this, t, 970, -100, cont));
    this.obstacles.push(new Cone(this, t, 1005, -40, cont));
    this.obstacles.push(new Cone(this, t, 1040, 40, cont));
    this.obstacles.push(new Cone(this, t, 1075, 100, cont));

    this.obstacles.push(new SwingingHammer(this, t, 1180, -160, 220, cont));
    this.obstacles.push(new Bumper(this, t, 1320, LANE_LATERAL[1], cont));
    this.obstacles.push(new Bumper(this, t, 1360, LANE_LATERAL[2], cont));

    this.obstacles.push(new MudZone(this, t, 1500, LANE_LATERAL[3], 130, 130, cont));
    this.addPickup(new EnergyPickup(this, t, 1620, LANE_LATERAL[2], cont));
    this.obstacles.push(new JumpBarrier(this, t, 1720, cont));

    this.obstacles.push(new MovingBlock(this, t, 1820, 40, 140, 2.3, cont));

    this.obstacles.push(new Cone(this, t, 1940, 80, cont));
    this.obstacles.push(new Cone(this, t, 1970, 0, cont));
    this.obstacles.push(new Cone(this, t, 2000, -80, cont));

    this.addPickup(new EnergyPickup(this, t, 2100, LANE_LATERAL[0], cont));
    this.obstacles.push(new SwingingHammer(this, t, 2300, 160, -220, cont));

    this.obstacles.push(new SpikeTrap(this, t, 2460, cont));
    this.obstacles.push(new Bumper(this, t, 2580, LANE_LATERAL[2], cont));
    this.obstacles.push(new Bumper(this, t, 2620, LANE_LATERAL[0], cont));

    this.obstacles.push(new MudZone(this, t, 2780, LANE_LATERAL[1], 110, 130, cont));
    this.addPickup(new EnergyPickup(this, t, 2920, 0, cont));

    this.obstacles.push(new MovingBlock(this, t, 3080, -30, 130, 2.0, cont));
    this.obstacles.push(new SpikeTrap(this, t, 3220, cont));
    this.obstacles.push(new SwingingHammer(this, t, 3360, -160, 220, cont));

    this.obstacles.push(new Cone(this, t, 3520, 0, cont));
    this.obstacles.push(new Cone(this, t, 3550, 60, cont));
    this.obstacles.push(new Cone(this, t, 3580, -60, cont));

    this.addPickup(new EnergyPickup(this, t, 3700, LANE_LATERAL[3], cont));
  }

  // ---- Input ----

  private createInput() {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };

    const sendLeft = () => gameSocket.sendInput({ laneLeft: true });
    const sendRight = () => gameSocket.sendInput({ laneRight: true });
    kb.on('keydown-A', sendLeft);
    kb.on('keydown-LEFT', sendLeft);
    kb.on('keydown-D', sendRight);
    kb.on('keydown-RIGHT', sendRight);

    kb.on('keydown-SPACE', () => gameSocket.sendInput({ jump: true }));
    kb.on('keydown-M', () => music.toggleMute());
  }

  // ---- HUD ----

  private createHud() {
    this.posText = this.add
      .text(16, 14, '★ -- / 25', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffcc33',
        stroke: '#000000',
        strokeThickness: 4
      })
      .setScrollFactor(0)
      .setDepth(20000);

    this.lapText = this.add
      .text(16, 46, 'LAP 1/3', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setScrollFactor(0)
      .setDepth(20000);

    this.energyLabel = this.add
      .text(16, 70, '⚡ ENERGY', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#aaccff',
        stroke: '#000000',
        strokeThickness: 2
      })
      .setScrollFactor(0)
      .setDepth(20000);
    this.add
      .rectangle(16, 90, 140, 12, 0x000000, 0.55)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(20000)
      .setStrokeStyle(2, 0xffffff, 0.6);
    this.energyFill = this.add
      .rectangle(18, 90, 0, 8, 0x66ccff)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(20001);

    this.timerText = this.add
      .text(16, 110, '◆ 0:00', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9bffd0',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setScrollFactor(0)
      .setDepth(20000);

    // Vertical progress bar on right
    const barX = VIEW.width - 24;
    const barTopY = 165;
    const barBottomY = 670;
    const barH = barBottomY - barTopY;
    const barW = 16;

    this.add
      .text(barX, barTopY - 14, 'DIST', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#9bb6ff',
        stroke: '#000000',
        strokeThickness: 2
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20000);
    this.add
      .text(barX, barTopY - 2, '▲ FIN', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#ffcc33'
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(20000);
    this.add
      .text(barX, barBottomY + 2, '▼ START', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#9bb6ff'
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20000);

    this.progressBg = this.add
      .rectangle(barX, (barTopY + barBottomY) / 2, barW, barH, 0x000000, 0.55)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20000);
    this.progressBg.setStrokeStyle(2, 0xffcc33, 0.7);

    this.progressFill = this.add
      .rectangle(barX, barBottomY - 2, barW - 6, 0, 0xffcc33)
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(20001);

    // Standings panel
    const panelW = 168;
    const panelRight = VIEW.width - 8;
    const panelCenterX = panelRight - panelW / 2;
    const headerY = 30;
    const rowHeight = 13;
    const panelTop = 44;
    const panelHeight = STANDINGS_ROWS * rowHeight + 6;
    const panelCenterY = panelTop + panelHeight / 2 - 3;

    this.add
      .rectangle(panelCenterX, headerY, panelW, 18, 0x000000, 0.7)
      .setScrollFactor(0)
      .setDepth(20000)
      .setStrokeStyle(2, 0xffcc33, 0.7);
    this.add
      .text(panelCenterX, headerY, '[ STANDINGS ]', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffcc33',
        stroke: '#000000',
        strokeThickness: 2
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20001);
    this.add
      .rectangle(panelCenterX, panelCenterY, panelW, panelHeight, 0x000000, 0.55)
      .setScrollFactor(0)
      .setDepth(20000)
      .setStrokeStyle(1, 0xffcc33, 0.4);

    const textLeft = panelCenterX - panelW / 2 + 6;
    for (let i = 0; i < STANDINGS_ROWS; i++) {
      this.standingsRows.push(
        this.add
          .text(textLeft, panelTop + i * rowHeight, '', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
          })
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(20001)
      );
    }

    this.add
      .text(VIEW.width / 2, VIEW.height - 14, 'A/D lanes  ·  W sprint  ·  S brake  ·  SPACE jump', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(20000);
  }

  private updateHud(time: number) {
    if (!this.localPlayer || this.racers.size === 0) return;

    const ranked = [...this.racers.values()].sort((a, b) => b.distance - a.distance);
    const playerRank = ranked.findIndex(v => v === this.localPlayer) + 1;
    const suffix = ordSuffix(playerRank);
    this.posText.setText(`★ ${playerRank}${suffix} / ${TOTAL_RACERS}`);
    this.posText.setColor(
      playerRank === 1 ? '#ffcc33' :
      playerRank <= 3 ? '#9bffd0' :
      playerRank >= TOTAL_RACERS - 2 ? '#ff6666' :
      '#ffffff'
    );

    const completed = Math.min(this.localPlayer.laps, LAPS);
    const currentLap = Math.min(completed + 1, LAPS);
    this.lapText.setText(`LAP ${currentLap}/${LAPS}`);
    if (completed > this.shownLap && completed > 0 && completed < LAPS) {
      this.shownLap = completed;
      this.flashLap(`LAP ${completed + 1}`);
    }

    const energyFrac = Phaser.Math.Clamp(this.localPlayer.energy / 100, 0, 1);
    this.energyFill.width = 136 * energyFrac;
    this.energyFill.fillColor =
      energyFrac > 0.5 ? 0x66ccff : energyFrac > 0.2 ? 0xffcc33 : 0xff6666;
    this.energyLabel.setColor(energyFrac > 0 ? '#aaccff' : '#ff6666');

    const elapsedMs = Date.now() - this.serverRaceStartTime;
    this.timerText.setText(`◆ ${formatRaceTime(elapsedMs)}`);

    // Vertical progress bar
    const barTopY = 165;
    const barBottomY = 670;
    const barH = barBottomY - barTopY;
    const playerProgress = Phaser.Math.Clamp(this.localPlayer.distance / this.serverTotalRaceLength, 0, 1);
    this.progressFill.setSize(10, Math.max(1, (barH - 4) * playerProgress));

    let dotIdx = 0;
    for (const id of this.racerOrderById) {
      const v = this.racers.get(id);
      const dot = this.racerDots[dotIdx++];
      if (!v || !dot) continue;
      const frac = Phaser.Math.Clamp(v.distance / this.serverTotalRaceLength, 0, 1);
      dot.y = barBottomY - frac * (barH - 4);
    }

    // Standings rows
    for (let i = 0; i < STANDINGS_ROWS; i++) {
      const v = ranked[i];
      const row = this.standingsRows[i];
      if (!v) {
        row.setText('');
        continue;
      }
      const place = `${i + 1}.`.padEnd(3, ' ');
      const nm = v.name.length > 11 ? v.name.slice(0, 11) : v.name;
      const tag = v.finished ? ' ✓' : '';
      row.setText(`${place}${nm}${tag}`);
      if (v === this.localPlayer) row.setColor('#ffcc33');
      else if (i === 0) row.setColor('#ffd866');
      else row.setColor('#ffffff');
    }

    void time;
  }

  private flashLap(label: string) {
    if (this.lapFlashText) this.lapFlashText.destroy();
    this.lapFlashText = this.add
      .text(VIEW.width / 2, 180, label, {
        fontFamily: 'monospace',
        fontSize: '54px',
        color: '#ffcc33',
        stroke: '#000000',
        strokeThickness: 6
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(25000);
    const t = this.lapFlashText;
    t.setScale(0.3).setAlpha(1);
    this.tweens.add({ targets: t, scale: 1, duration: 250, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 600, onComplete: () => t.destroy() });
  }

  private startCountdownVisual() {
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2 - 40;
    this.countdownText = this.add
      .text(cx, cy, '3', {
        fontFamily: 'monospace',
        fontSize: '128px',
        color: '#ff3333',
        stroke: '#000000',
        strokeThickness: 8
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30000);
    this.popCountdown();
    const labels = ['3', '2', '1', 'GO!'];
    const colors = ['#ff3333', '#ffaa33', '#ffff33', '#33ff33'];
    let i = 1;
    this.time.addEvent({
      delay: 900,
      repeat: 3,
      callback: () => {
        if (!this.countdownText) return;
        if (i < labels.length) {
          this.countdownText.setText(labels[i]).setColor(colors[i]);
          this.popCountdown();
          i++;
        } else {
          const t = this.countdownText;
          this.tweens.add({
            targets: t,
            alpha: 0,
            scale: 2,
            duration: 300,
            onComplete: () => t.destroy()
          });
          this.countdownText = undefined;
        }
      }
    });
  }

  private popCountdown() {
    if (!this.countdownText) return;
    this.countdownText.setScale(1.6).setAlpha(1);
    this.tweens.add({ targets: this.countdownText, scale: 1, duration: 250, ease: 'Back.out' });
  }
}
