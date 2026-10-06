import { GAME_CONSTANTS } from '../shared/constants.js';
import {
  CoinState,
  CoinType,
  GameStateSnapshot,
  MatchResults,
  PlayerResult,
  PlayerState,
  ScoreAchievement,
} from '../shared/types.js';

export class GameEngine {
  public players: Map<string, PlayerState> = new Map();
  public coins: Map<string, CoinState> = new Map();
  public scoreHistory: ScoreAchievement[] = [];
  public totalCoinsCollected: number = 0;
  private coinCounter: number = 0;
  private isRushHourActive: boolean = false;
  private onCoinCollectedCallback?: (collector: PlayerState, coin: CoinState) => void;
  private onRushHourStartCallback?: () => void;

  constructor(
    private roomCode: string,
    callbacks?: {
      onCoinCollected?: (collector: PlayerState, coin: CoinState) => void;
      onRushHourStart?: () => void;
    }
  ) {
    this.onCoinCollectedCallback = callbacks?.onCoinCollected;
    this.onRushHourStartCallback = callbacks?.onRushHourStart;
    this.spawnInitialCoins();
  }

  public reset(): void {
    this.coins.clear();
    this.scoreHistory = [];
    this.totalCoinsCollected = 0;
    this.isRushHourActive = false;
    for (const player of this.players.values()) {
      player.score = 0;
      // Reposition players safely inside arena
      player.x = 100 + Math.random() * (GAME_CONSTANTS.ARENA_WIDTH - 200);
      player.y = 100 + Math.random() * (GAME_CONSTANTS.ARENA_HEIGHT - 200);
    }
    this.spawnInitialCoins();
  }

  public spawnInitialCoins(): void {
    while (this.coins.size < GAME_CONSTANTS.INITIAL_COINS) {
      this.spawnCoin();
    }
  }

  public spawnCoin(forceGolden = false): CoinState {
    this.coinCounter++;
    const isGolden =
      forceGolden ||
      Math.random() <
        (this.isRushHourActive
          ? GAME_CONSTANTS.GOLDEN_COIN_PROBABILITY * 2.2
          : GAME_CONSTANTS.GOLDEN_COIN_PROBABILITY);

    const type: CoinType = isGolden ? 'golden' : 'normal';
    const value = isGolden ? GAME_CONSTANTS.GOLDEN_COIN_VALUE : GAME_CONSTANTS.NORMAL_COIN_VALUE;

    // Keep coins within arena margin
    const margin = GAME_CONSTANTS.COIN_RADIUS + 30;
    const x = margin + Math.random() * (GAME_CONSTANTS.ARENA_WIDTH - margin * 2);
    const y = margin + Math.random() * (GAME_CONSTANTS.ARENA_HEIGHT - margin * 2);

    const coin: CoinState = {
      id: `c_${this.coinCounter}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      x: Math.round(x),
      y: Math.round(y),
      value,
      radius: GAME_CONSTANTS.COIN_RADIUS,
    };

    this.coins.set(coin.id, coin);
    return coin;
  }

  public processPlayerMove(playerId: string, dir: { x: number; y: number }): void {
    const player = this.players.get(playerId);
    if (!player || !player.connected) return;

    // Normalize direction vector if diagonal
    let dx = dir.x;
    let dy = dir.y;
    const length = Math.hypot(dx, dy);

    if (length > 0) {
      dx = (dx / length) * GAME_CONSTANTS.MOVEMENT_SPEED;
      dy = (dy / length) * GAME_CONSTANTS.MOVEMENT_SPEED;
    }

    // Apply authoritative velocity
    player.x += dx;
    player.y += dy;

    // Authoritative boundary clamping
    const minX = player.radius;
    const maxX = GAME_CONSTANTS.ARENA_WIDTH - player.radius;
    const minY = player.radius;
    const maxY = GAME_CONSTANTS.ARENA_HEIGHT - player.radius;

    player.x = Math.max(minX, Math.min(maxX, player.x));
    player.y = Math.max(minY, Math.min(maxY, player.y));

    // Check collisions
    this.checkCollisions(player);
  }

  public updateBots(): void {
    for (const player of this.players.values()) {
      if (!player.isBot || !player.connected) continue;

      // Find nearest coin (prioritizing golden coins if nearby)
      let bestCoin: CoinState | null = null;
      let minScoreDist = Infinity;

      for (const coin of this.coins.values()) {
        const dist = Math.hypot(coin.x - player.x, coin.y - player.y);
        // Weight golden coins as 2.5x more attractive
        const weightedDist = dist / (coin.type === 'golden' ? 2.5 : 1);
        if (weightedDist < minScoreDist) {
          minScoreDist = weightedDist;
          bestCoin = coin;
        }
      }

      if (bestCoin) {
        const dx = bestCoin.x - player.x;
        const dy = bestCoin.y - player.y;
        this.processPlayerMove(player.id, { x: dx, y: dy });
      }
    }
  }

  private checkCollisions(player: PlayerState): void {
    for (const [coinId, coin] of this.coins.entries()) {
      const dist = Math.hypot(coin.x - player.x, coin.y - player.y);
      if (dist < player.radius + coin.radius) {
        // Collect coin!
        this.coins.delete(coinId);
        player.score += coin.value;
        this.totalCoinsCollected++;

        // Record score achievement for tie breaking
        this.scoreHistory.push({
          playerId: player.id,
          score: player.score,
          timestamp: Date.now(),
        });

        if (this.onCoinCollectedCallback) {
          this.onCoinCollectedCallback(player, coin);
        }

        // Replenish coins
        if (this.coins.size < GAME_CONSTANTS.MAX_COINS) {
          this.spawnCoin();
        }
        break; // Process one collection per tick to prevent multi-grab
      }
    }
  }

  public updateTime(remainingSeconds: number): void {
    // Check Rush Hour trigger in final 15 seconds
    if (remainingSeconds <= GAME_CONSTANTS.RUSH_HOUR_THRESHOLD_SECONDS && !this.isRushHourActive) {
      this.isRushHourActive = true;
      // Spawn burst of golden frenzy coins
      this.spawnCoin(true);
      this.spawnCoin(true);
      this.spawnCoin(true);
      if (this.onRushHourStartCallback) {
        this.onRushHourStartCallback();
      }
    }

    // Dynamic coin spawn in Rush Hour
    if (this.isRushHourActive && Math.random() < 0.25 && this.coins.size < GAME_CONSTANTS.MAX_COINS) {
      this.spawnCoin();
    }
  }

  public calculateResults(): MatchResults {
    const list = Array.from(this.players.values());

    // Sort by score descending
    list.sort((a, b) => b.score - a.score);

    let tieBreakApplied = false;
    if (list.length >= 2 && list[0] && list[1] && list[0].score === list[1].score && list[0].score > 0) {
      // Find who reached the tied score first
      const tiedScore = list[0].score;
      const firstA = this.scoreHistory.find((s) => s.playerId === list[0]!.id && s.score === tiedScore);
      const firstB = this.scoreHistory.find((s) => s.playerId === list[1]!.id && s.score === tiedScore);

      if (firstA && firstB) {
        if (firstB.timestamp < firstA.timestamp) {
          // Swap: Player B reached it first!
          const temp = list[0];
          list[0] = list[1];
          list[1] = temp;
          tieBreakApplied = true;
        } else if (firstA.timestamp < firstB.timestamp) {
          tieBreakApplied = true;
        }
      }
    }

    const leaderboard: PlayerResult[] = list.map((p, index) => ({
      id: p.id,
      nickname: p.nickname,
      color: p.color,
      score: p.score,
      rank: index + 1,
      isBot: p.isBot,
    }));

    const winner = leaderboard[0] ?? null;

    return {
      roomCode: this.roomCode,
      winner,
      tieBreakApplied,
      leaderboard,
      totalCoinsCollected: this.totalCoinsCollected,
      matchDurationSeconds: GAME_CONSTANTS.MATCH_DURATION_SECONDS,
    };
  }

  public getSnapshot(status: any, timeRemaining: number, countdownValue: number, results: MatchResults | null): GameStateSnapshot {
    return {
      roomCode: this.roomCode,
      status,
      timeRemaining,
      isRushHour: this.isRushHourActive,
      players: Array.from(this.players.values()),
      coins: Array.from(this.coins.values()),
      countdownValue,
      results,
      timestamp: Date.now(),
    };
  }
}
