import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { GAME_CONSTANTS } from '../shared/constants.js';
import {
  CoinState,
  GameEvent,
  MatchResults,
  PlayerState,
  RoomStatus,
} from '../shared/types.js';
import { GameEngine } from './GameEngine.js';

interface PlayerSession {
  playerId: string;
  sessionToken: string;
  socketId: string | null;
  nickname: string;
  color: string;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  disconnectTimer?: NodeJS.Timeout;
  moveTimestamps: number[];
}

export class GameRoom {
  public code: string;
  public status: RoomStatus = 'WAITING';
  public hostPlayerId: string = '';
  public players: Map<string, PlayerSession> = new Map();
  public engine: GameEngine;
  private io: Server;
  private gameInterval: NodeJS.Timeout | null = null;
  private matchTimeRemaining: number = GAME_CONSTANTS.MATCH_DURATION_SECONDS;
  private countdownValue: number = 0;
  private results: MatchResults | null = null;
  private onRoomEmptyCallback: (roomCode: string) => void;
  private botIndex: number = 0;

  constructor(
    code: string,
    io: Server,
    onRoomEmpty: (roomCode: string) => void
  ) {
    this.code = code;
    this.io = io;
    this.onRoomEmptyCallback = onRoomEmpty;
    this.engine = new GameEngine(code, {
      onCoinCollected: (collector, coin) => this.handleCoinCollected(collector, coin),
      onRushHourStart: () => this.handleRushHourStart(),
    });
  }

  public addPlayer(
    socket: Socket,
    nickname: string,
    existingToken?: string
  ): { playerId: string; sessionToken: string; isHost: boolean } {
    // 1. Reconnection check
    if (existingToken) {
      for (const session of this.players.values()) {
        if (session.sessionToken === existingToken) {
          if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
            delete session.disconnectTimer;
          }
          session.socketId = socket.id;
          session.connected = true;

          const enginePlayer = this.engine.players.get(session.playerId);
          if (enginePlayer) {
            enginePlayer.connected = true;
          }

          socket.join(this.code);
          this.broadcastEvent({
            type: 'reconnected',
            data: { playerId: session.playerId, nickname: session.nickname },
          });
          this.broadcastState();

          return {
            playerId: session.playerId,
            sessionToken: session.sessionToken,
            isHost: session.isHost,
          };
        }
      }
    }

    // 2. Room capacity check
    if (this.players.size >= GAME_CONSTANTS.MAX_PLAYERS) {
      throw new Error('Room is full (max 6 players)');
    }

    // 3. New player creation
    const playerId = `p_${Math.random().toString(36).slice(2, 9)}`;
    const sessionToken = crypto.randomBytes(16).toString('hex');
    const isHost = this.players.size === 0;
    const color = GAME_CONSTANTS.PLAYER_COLORS[this.players.size % GAME_CONSTANTS.PLAYER_COLORS.length] || '#00f0ff';

    const session: PlayerSession = {
      playerId,
      sessionToken,
      socketId: socket.id,
      nickname,
      color,
      connected: true,
      isHost,
      isBot: false,
      moveTimestamps: [],
    };

    if (isHost) {
      this.hostPlayerId = playerId;
    }

    this.players.set(playerId, session);

    // Add to authoritative game engine
    const playerState: PlayerState = {
      id: playerId,
      nickname,
      color,
      x: 100 + Math.random() * (GAME_CONSTANTS.ARENA_WIDTH - 200),
      y: 100 + Math.random() * (GAME_CONSTANTS.ARENA_HEIGHT - 200),
      score: 0,
      ready: isHost, // Host is ready by default
      connected: true,
      isHost,
      isBot: false,
      radius: GAME_CONSTANTS.PLAYER_RADIUS,
      ping: 0,
      joinedAt: Date.now(),
    };
    this.engine.players.set(playerId, playerState);

    socket.join(this.code);
    this.broadcastEvent({
      type: 'player_joined',
      data: { playerId, nickname, isHost },
    });
    this.broadcastState();

    return { playerId, sessionToken, isHost };
  }

  public addBot(): PlayerState | null {
    if (this.players.size >= GAME_CONSTANTS.MAX_PLAYERS) return null;
    this.botIndex++;
    const botId = `bot_${this.botIndex}`;
    const botNames = ['CyberBot', 'BlitzAI', 'TurboDrone', 'CoinHunter', 'ApexUnit'];
    const nickname = botNames[(this.botIndex - 1) % botNames.length] || `Bot-${this.botIndex}`;
    const color = GAME_CONSTANTS.PLAYER_COLORS[this.players.size % GAME_CONSTANTS.PLAYER_COLORS.length] || '#ff0077';

    const session: PlayerSession = {
      playerId: botId,
      sessionToken: `bot_token_${botId}`,
      socketId: null,
      nickname,
      color,
      connected: true,
      isHost: false,
      isBot: true,
      moveTimestamps: [],
    };

    this.players.set(botId, session);

    const playerState: PlayerState = {
      id: botId,
      nickname,
      color,
      x: 100 + Math.random() * (GAME_CONSTANTS.ARENA_WIDTH - 200),
      y: 100 + Math.random() * (GAME_CONSTANTS.ARENA_HEIGHT - 200),
      score: 0,
      ready: true,
      connected: true,
      isHost: false,
      isBot: true,
      radius: GAME_CONSTANTS.PLAYER_RADIUS,
      ping: 0,
      joinedAt: Date.now(),
    };

    this.engine.players.set(botId, playerState);
    this.broadcastState();
    return playerState;
  }

  public handleDisconnect(socketId: string): void {
    let disconnectedPlayer: PlayerSession | null = null;
    for (const session of this.players.values()) {
      if (session.socketId === socketId) {
        disconnectedPlayer = session;
        break;
      }
    }

    if (!disconnectedPlayer) return;

    disconnectedPlayer.connected = false;
    disconnectedPlayer.socketId = null;

    const enginePlayer = this.engine.players.get(disconnectedPlayer.playerId);
    if (enginePlayer) {
      enginePlayer.connected = false;
    }

    // Host migration check if host disconnected
    if (disconnectedPlayer.isHost) {
      this.migrateHost();
    }

    this.broadcastEvent({
      type: 'player_left',
      data: {
        playerId: disconnectedPlayer.playerId,
        nickname: disconnectedPlayer.nickname,
        temporary: true,
      },
    });
    this.broadcastState();

    // 30-Second Reconnection Grace Period
    disconnectedPlayer.disconnectTimer = setTimeout(() => {
      this.removePlayerPermanently(disconnectedPlayer!.playerId);
    }, GAME_CONSTANTS.RECONNECT_GRACE_MS);
  }

  public removePlayerPermanently(playerId: string): void {
    const session = this.players.get(playerId);
    if (!session) return;

    if (session.disconnectTimer) {
      clearTimeout(session.disconnectTimer);
    }

    this.players.delete(playerId);
    this.engine.players.delete(playerId);

    if (session.isHost) {
      this.migrateHost();
    }

    this.broadcastEvent({
      type: 'player_left',
      data: { playerId, nickname: session.nickname, permanent: true },
    });

    // Check if room is empty
    const connectedHumans = Array.from(this.players.values()).filter((p) => !p.isBot && p.connected);
    if (connectedHumans.length === 0) {
      this.destroy();
      this.onRoomEmptyCallback(this.code);
    } else {
      this.broadcastState();
    }
  }

  private migrateHost(): void {
    // Pick the earliest joined connected human player
    const candidate = Array.from(this.players.values())
      .filter((p) => p.connected && !p.isBot)
      .sort((a, b) => {
        const joinA = this.engine.players.get(a.playerId)?.joinedAt || 0;
        const joinB = this.engine.players.get(b.playerId)?.joinedAt || 0;
        return joinA - joinB;
      })[0];

    if (candidate) {
      for (const p of this.players.values()) {
        p.isHost = false;
        const ep = this.engine.players.get(p.playerId);
        if (ep) ep.isHost = false;
      }

      candidate.isHost = true;
      this.hostPlayerId = candidate.playerId;
      const engineCandidate = this.engine.players.get(candidate.playerId);
      if (engineCandidate) engineCandidate.isHost = true;

      this.broadcastEvent({
        type: 'host_migrated',
        data: { newHostId: candidate.playerId, nickname: candidate.nickname },
      });
    }
  }

  public setPlayerReady(playerId: string, ready: boolean): void {
    const player = this.engine.players.get(playerId);
    if (player) {
      player.ready = ready;
      this.broadcastState();
    }
  }

  public handlePlayerMove(playerId: string, dir: { x: number; y: number }): void {
    if (this.status !== 'PLAYING') return;

    // Rate limiting: 30 packets / sec
    const session = this.players.get(playerId);
    if (!session) return;

    const now = Date.now();
    session.moveTimestamps = session.moveTimestamps.filter((t) => now - t < 1000);
    if (session.moveTimestamps.length >= GAME_CONSTANTS.MOVE_RATE_LIMIT_PER_SEC) {
      return; // Drop packet due to rate limit
    }
    session.moveTimestamps.push(now);

    this.engine.processPlayerMove(playerId, dir);
  }

  public startCountdown(requesterId: string): void {
    if (this.status !== 'WAITING') return;
    const requester = this.players.get(requesterId);
    if (!requester?.isHost) return;

    // Can start if >= 2 players, OR if 1 human + bots
    if (this.players.size < 2) return;

    this.status = 'COUNTDOWN';
    this.countdownValue = GAME_CONSTANTS.COUNTDOWN_SECONDS;
    this.broadcastEvent({ type: 'countdown', data: { count: this.countdownValue } });
    this.broadcastState();

    const countdownTimer = setInterval(() => {
      this.countdownValue--;

      // Safety check: if players leave during countdown
      const connectedCount = Array.from(this.players.values()).filter((p) => p.connected).length;
      if (connectedCount < 1) {
        clearInterval(countdownTimer);
        this.status = 'WAITING';
        this.broadcastState();
        return;
      }

      if (this.countdownValue > 0) {
        this.broadcastEvent({ type: 'countdown', data: { count: this.countdownValue } });
        this.broadcastState();
      } else {
        clearInterval(countdownTimer);
        this.startMatch();
      }
    }, 1000);
  }

  private startMatch(): void {
    this.status = 'PLAYING';
    this.matchTimeRemaining = GAME_CONSTANTS.MATCH_DURATION_SECONDS;
    this.results = null;
    this.engine.reset();

    this.broadcastEvent({ type: 'match_started', data: { roomCode: this.code } });

    // Start 30Hz game loop
    const tickIntervalMs = Math.round(1000 / GAME_CONSTANTS.SERVER_TICK_RATE);
    let lastSecondTime = Date.now();

    this.gameInterval = setInterval(() => {
      if (this.status !== 'PLAYING') return;

      const now = Date.now();

      // Update bot movement
      this.engine.updateBots();

      // Decrement match timer once per second
      if (now - lastSecondTime >= 1000) {
        lastSecondTime = now;
        this.matchTimeRemaining--;
        this.engine.updateTime(this.matchTimeRemaining);

        if (this.matchTimeRemaining <= 0) {
          this.endMatch();
          return;
        }
      }

      this.broadcastState();
    }, tickIntervalMs);
  }

  private endMatch(): void {
    this.status = 'ENDED';
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    this.results = this.engine.calculateResults();
    this.broadcastEvent({ type: 'match_ended', data: this.results });
    this.broadcastState();
  }

  public handleRematch(requesterId: string): void {
    const requester = this.players.get(requesterId);
    if (!requester?.isHost || this.status !== 'ENDED') return;

    this.status = 'WAITING';
    this.engine.reset();
    this.results = null;
    this.matchTimeRemaining = GAME_CONSTANTS.MATCH_DURATION_SECONDS;

    // Reset player ready flags except host
    for (const p of this.engine.players.values()) {
      p.score = 0;
      p.ready = p.isHost;
    }

    this.broadcastState();
  }

  private handleCoinCollected(collector: PlayerState, coin: CoinState): void {
    this.broadcastEvent({
      type: 'coin_collected',
      data: {
        collectorId: collector.id,
        coinId: coin.id,
        coinType: coin.type,
        coinValue: coin.value,
        newScore: collector.score,
        x: coin.x,
        y: coin.y,
      },
    });
  }

  private handleRushHourStart(): void {
    this.broadcastEvent({
      type: 'rush_hour_start',
      data: { timeRemaining: this.matchTimeRemaining },
    });
  }

  private broadcastState(): void {
    const snapshot = this.engine.getSnapshot(
      this.status,
      this.matchTimeRemaining,
      this.countdownValue,
      this.results
    );
    this.io.to(this.code).emit('game_state', snapshot);
  }

  private broadcastEvent(event: GameEvent): void {
    this.io.to(this.code).emit('game_event', event);
  }

  public destroy(): void {
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }
    for (const session of this.players.values()) {
      if (session.disconnectTimer) {
        clearTimeout(session.disconnectTimer);
      }
    }
    this.players.clear();
    this.engine.players.clear();
  }
}
