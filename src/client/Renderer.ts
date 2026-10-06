import { GAME_CONSTANTS } from '../shared/constants.js';
import { CoinState, GameEvent, GameStateSnapshot, PlayerState } from '../shared/types.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = window.innerWidth;
  private height: number = window.innerHeight;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

  // Effects
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private playerTrails: Map<string, TrailPoint[]> = new Map();
  private starfield: { x: number; y: number; size: number; speed: number; alpha: number }[] = [];

  // Snapshot cache for smooth LERP
  private prevSnapshot: GameStateSnapshot | null = null;
  private currSnapshot: GameStateSnapshot | null = null;
  private lastSnapshotTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get canvas context');
    this.ctx = context;

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    this.initStarfield();
  }

  private handleResize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    const scaleX = this.width / GAME_CONSTANTS.ARENA_WIDTH;
    const scaleY = this.height / GAME_CONSTANTS.ARENA_HEIGHT;
    this.scale = Math.min(scaleX, scaleY) * 0.94;

    this.offsetX = (this.width - GAME_CONSTANTS.ARENA_WIDTH * this.scale) / 2;
    this.offsetY = (this.height - GAME_CONSTANTS.ARENA_HEIGHT * this.scale) / 2;
  }

  private initStarfield(): void {
    this.starfield = [];
    for (let i = 0; i < 100; i++) {
      this.starfield.push({
        x: Math.random() * GAME_CONSTANTS.ARENA_WIDTH,
        y: Math.random() * GAME_CONSTANTS.ARENA_HEIGHT,
        size: Math.random() * 1.8 + 0.6,
        speed: Math.random() * 0.3 + 0.1,
        alpha: Math.random() * 0.6 + 0.2,
      });
    }
  }

  public updateSnapshot(snapshot: GameStateSnapshot): void {
    this.prevSnapshot = this.currSnapshot;
    this.currSnapshot = snapshot;
    this.lastSnapshotTime = performance.now();
  }

  public triggerEvent(event: GameEvent): void {
    if (event.type === 'coin_collected' && event.data) {
      const { x, y, coinType, coinValue } = event.data;
      const isGolden = coinType === 'golden';
      const color = isGolden ? '#ffd700' : '#00f0ff';

      // Spawn burst particles
      const count = isGolden ? 24 : 14;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (isGolden ? 5 : 3.5) + 1;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          alpha: 1,
          size: Math.random() * 3 + 2,
          life: 0,
          maxLife: 20 + Math.random() * 15,
        });
      }

      // Add floating score popup
      this.floatingTexts.push({
        x,
        y: y - 10,
        text: isGolden ? `+${coinValue} GOLDEN!` : `+${coinValue}`,
        color,
        alpha: 1,
        vy: -1.8,
      });
    }
  }

  public render(localPlayerId: string | null): void {
    // 1. Clear Screen
    this.ctx.fillStyle = '#060713';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Arena boundary transform
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // 2. Draw Arena Background & Grid
    this.drawArenaBackground();

    // 3. Draw Coins
    if (this.currSnapshot) {
      this.drawCoins(this.currSnapshot.coins);
    }

    // 4. Draw Player Trails
    this.drawPlayerTrails();

    // 5. Draw Players with LERP Interpolation
    if (this.currSnapshot) {
      this.drawPlayers(this.currSnapshot.players, localPlayerId);
    }

    // 6. Draw Particles & Floating Scores
    this.drawParticles();
    this.drawFloatingTexts();

    // 7. Draw Arena Boundary Border
    this.drawArenaBorder();

    this.ctx.restore();
  }

  private drawArenaBackground(): void {
    // Arena Fill
    this.ctx.fillStyle = '#0a0d1e';
    this.ctx.fillRect(0, 0, GAME_CONSTANTS.ARENA_WIDTH, GAME_CONSTANTS.ARENA_HEIGHT);

    // Background Stars
    for (const star of this.starfield) {
      star.y += star.speed;
      if (star.y > GAME_CONSTANTS.ARENA_HEIGHT) star.y = 0;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      this.ctx.fillRect(star.x, star.y, star.size, star.size);
    }

    // Subtle Cyan Grid Lines
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    this.ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x <= GAME_CONSTANTS.ARENA_WIDTH; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, GAME_CONSTANTS.ARENA_HEIGHT);
      this.ctx.stroke();
    }
    for (let y = 0; y <= GAME_CONSTANTS.ARENA_HEIGHT; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(GAME_CONSTANTS.ARENA_WIDTH, y);
      this.ctx.stroke();
    }
  }

  private drawArenaBorder(): void {
    const isRush = this.currSnapshot?.isRushHour;
    const time = performance.now() * 0.003;
    const pulseAlpha = 0.6 + Math.sin(time) * 0.3;

    this.ctx.strokeStyle = isRush
      ? `rgba(255, 69, 0, ${pulseAlpha})`
      : `rgba(0, 240, 255, ${pulseAlpha})`;
    this.ctx.lineWidth = isRush ? 4 : 2;
    this.ctx.strokeRect(0, 0, GAME_CONSTANTS.ARENA_WIDTH, GAME_CONSTANTS.ARENA_HEIGHT);

    // Inner Glow
    this.ctx.strokeStyle = isRush ? 'rgba(255, 215, 0, 0.15)' : 'rgba(0, 240, 255, 0.1)';
    this.ctx.lineWidth = 8;
    this.ctx.strokeRect(4, 4, GAME_CONSTANTS.ARENA_WIDTH - 8, GAME_CONSTANTS.ARENA_HEIGHT - 8);
  }

  private drawCoins(coins: CoinState[]): void {
    const now = performance.now();

    for (const coin of coins) {
      const isGolden = coin.type === 'golden';
      const bob = Math.sin(now * 0.005 + coin.x) * 2;
      const cy = coin.y + bob;

      // Outer Glow
      const glowGrad = this.ctx.createRadialGradient(coin.x, cy, 2, coin.x, cy, coin.radius * 2);
      if (isGolden) {
        glowGrad.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
        glowGrad.addColorStop(1, 'rgba(255, 140, 0, 0)');
      } else {
        glowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.6)');
        glowGrad.addColorStop(1, 'rgba(0, 150, 255, 0)');
      }
      this.ctx.fillStyle = glowGrad;
      this.ctx.beginPath();
      this.ctx.arc(coin.x, cy, coin.radius * 2, 0, Math.PI * 2);
      this.ctx.fill();

      // Coin Body
      this.ctx.fillStyle = isGolden ? '#ffd700' : '#00f0ff';
      this.ctx.beginPath();
      this.ctx.arc(coin.x, cy, coin.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Inner Symbol
      this.ctx.fillStyle = '#060713';
      this.ctx.font = 'bold 11px Inter, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(isGolden ? '★' : '$', coin.x, cy);
    }
  }

  private drawPlayerTrails(): void {
    for (const [, trails] of this.playerTrails.entries()) {
      for (let i = 0; i < trails.length; i++) {
        const pt = trails[i];
        if (!pt) continue;
        pt.alpha -= 0.04;
        if (pt.alpha <= 0) {
          trails.splice(i, 1);
          i--;
          continue;
        }

        this.ctx.fillStyle = `rgba(0, 240, 255, ${pt.alpha * 0.3})`;
        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawPlayers(players: PlayerState[], localPlayerId: string | null): void {
    // Interpolation fraction between snapshots
    const tickDuration = 1000 / GAME_CONSTANTS.SERVER_TICK_RATE;
    const elapsed = performance.now() - this.lastSnapshotTime;
    const lerpFactor = Math.min(1, Math.max(0, elapsed / tickDuration));

    for (const player of players) {
      if (!player.connected) continue;

      // Calculate interpolated position
      let rx = player.x;
      let ry = player.y;

      if (this.prevSnapshot) {
        const prevP = this.prevSnapshot.players.find((p) => p.id === player.id);
        if (prevP) {
          rx = prevP.x + (player.x - prevP.x) * lerpFactor;
          ry = prevP.y + (player.y - prevP.y) * lerpFactor;
        }
      }

      // Record trail point
      if (!this.playerTrails.has(player.id)) {
        this.playerTrails.set(player.id, []);
      }
      const trails = this.playerTrails.get(player.id)!;
      trails.push({ x: rx, y: ry, alpha: 0.6 });
      if (trails.length > 12) trails.shift();

      const isLocal = player.id === localPlayerId;

      // Glow Aura
      const auraGrad = this.ctx.createRadialGradient(rx, ry, 5, rx, ry, player.radius * 1.8);
      auraGrad.addColorStop(0, player.color);
      auraGrad.addColorStop(1, 'transparent');
      this.ctx.fillStyle = auraGrad;
      this.ctx.beginPath();
      this.ctx.arc(rx, ry, player.radius * 1.8, 0, Math.PI * 2);
      this.ctx.fill();

      // Core Avatar
      this.ctx.fillStyle = player.color;
      this.ctx.beginPath();
      this.ctx.arc(rx, ry, player.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Inner Center Indicator
      this.ctx.fillStyle = '#060713';
      this.ctx.beginPath();
      this.ctx.arc(rx, ry, player.radius * 0.45, 0, Math.PI * 2);
      this.ctx.fill();

      if (isLocal) {
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.arc(rx, ry, player.radius + 3, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Nickname & Score Tag
      this.ctx.fillStyle = isLocal ? '#39ff14' : '#ffffff';
      this.ctx.font = '600 12px Inter, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${player.nickname} (${player.score})`, rx, ry - player.radius - 8);
    }
  }

  private drawParticles(): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life++;
      p.alpha = 1 - p.life / p.maxLife;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        i--;
        continue;
      }

      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  private drawFloatingTexts(): void {
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const t = this.floatingTexts[i];
      if (!t) continue;
      t.y += t.vy;
      t.alpha -= 0.025;

      if (t.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
        i--;
        continue;
      }

      this.ctx.fillStyle = t.color;
      this.ctx.globalAlpha = t.alpha;
      this.ctx.font = '800 13px Orbitron, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(t.text, t.x, t.y);
    }
    this.ctx.globalAlpha = 1;
  }
}
