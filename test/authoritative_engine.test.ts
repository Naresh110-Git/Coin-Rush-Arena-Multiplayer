import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/server/GameEngine.js';
import { GAME_CONSTANTS } from '../src/shared/constants.js';
import { PlayerState } from '../src/shared/types.js';

describe('Authoritative GameEngine Tests', () => {
  it('clamps player within arena boundaries', () => {
    const engine = new GameEngine('TEST');
    const player: PlayerState = {
      id: 'p1',
      nickname: 'Tester',
      color: '#00f0ff',
      x: 50,
      y: 50,
      score: 0,
      ready: true,
      connected: true,
      isHost: true,
      isBot: false,
      radius: GAME_CONSTANTS.PLAYER_RADIUS,
      ping: 0,
      joinedAt: Date.now(),
    };
    engine.players.set(player.id, player);

    // Try to move far out of bounds to the left/up
    for (let i = 0; i < 20; i++) {
      engine.processPlayerMove(player.id, { x: -100, y: -100 });
    }

    expect(player.x).toBe(GAME_CONSTANTS.PLAYER_RADIUS);
    expect(player.y).toBe(GAME_CONSTANTS.PLAYER_RADIUS);

    // Try to move far out of bounds to the bottom/right
    for (let i = 0; i < 200; i++) {
      engine.processPlayerMove(player.id, { x: 100, y: 100 });
    }

    expect(player.x).toBe(GAME_CONSTANTS.ARENA_WIDTH - GAME_CONSTANTS.PLAYER_RADIUS);
    expect(player.y).toBe(GAME_CONSTANTS.ARENA_HEIGHT - GAME_CONSTANTS.PLAYER_RADIUS);
  });

  it('detects coin collisions and awards points authoritatively', () => {
    const engine = new GameEngine('TEST');
    const player: PlayerState = {
      id: 'p1',
      nickname: 'Collector',
      color: '#00f0ff',
      x: 200,
      y: 200,
      score: 0,
      ready: true,
      connected: true,
      isHost: true,
      isBot: false,
      radius: GAME_CONSTANTS.PLAYER_RADIUS,
      ping: 0,
      joinedAt: Date.now(),
    };
    engine.players.set(player.id, player);

    // Manually place a normal coin right on player position
    engine.coins.clear();
    const testCoin = {
      id: 'coin_normal',
      type: 'normal' as const,
      x: 205,
      y: 200,
      value: 1,
      radius: GAME_CONSTANTS.COIN_RADIUS,
    };
    engine.coins.set(testCoin.id, testCoin);

    // Move slightly into the coin
    engine.processPlayerMove(player.id, { x: 1, y: 0 });

    expect(player.score).toBe(1);
    expect(engine.totalCoinsCollected).toBe(1);
    expect(engine.scoreHistory.length).toBe(1);
  });

  it('breaks score ties in favor of the player who reached the tied score first', () => {
    const engine = new GameEngine('TIE');
    const p1: PlayerState = {
      id: 'p1',
      nickname: 'Player One',
      color: '#00f0ff',
      x: 100,
      y: 100,
      score: 5,
      ready: true,
      connected: true,
      isHost: true,
      isBot: false,
      radius: 18,
      ping: 0,
      joinedAt: 1000,
    };
    const p2: PlayerState = {
      id: 'p2',
      nickname: 'Player Two',
      color: '#ff0077',
      x: 300,
      y: 100,
      score: 5,
      ready: true,
      connected: true,
      isHost: false,
      isBot: false,
      radius: 18,
      ping: 0,
      joinedAt: 1005,
    };

    engine.players.set(p1.id, p1);
    engine.players.set(p2.id, p2);

    // P1 reached score 5 at t=5000, P2 reached score 5 at t=7000
    engine.scoreHistory = [
      { playerId: 'p1', score: 5, timestamp: 5000 },
      { playerId: 'p2', score: 5, timestamp: 7000 },
    ];

    const results = engine.calculateResults();
    expect(results.tieBreakApplied).toBe(true);
    expect(results.winner?.id).toBe('p1');
    expect(results.leaderboard[0]?.id).toBe('p1');
    expect(results.leaderboard[1]?.id).toBe('p2');
  });

  it('activates Rush Hour in the final 15 seconds', () => {
    let rushHourTriggered = false;
    const engine = new GameEngine('RUSH', {
      onRushHourStart: () => {
        rushHourTriggered = true;
      },
    });

    // At 20s remaining, Rush Hour should NOT be active
    engine.updateTime(20);
    expect(rushHourTriggered).toBe(false);

    // At 15s remaining, Rush Hour should activate!
    engine.updateTime(15);
    expect(rushHourTriggered).toBe(true);
  });
});
