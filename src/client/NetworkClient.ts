import { io, Socket } from 'socket.io-client';
import { GameEvent, GameStateSnapshot, PublicRoomInfo, RoomResponse } from '../shared/types.js';

export class NetworkClient {
  public socket: Socket;
  public roomCode: string | null = null;
  public playerId: string | null = null;
  public sessionToken: string | null = null;
  public isHost: boolean = false;
  public currentPing: number = 0;

  private onStateCallback?: (state: GameStateSnapshot) => void;
  private onEventCallback?: (event: GameEvent) => void;
  private onPublicRoomsCallback?: (rooms: PublicRoomInfo[]) => void;
  private onPingCallback?: (pingMs: number) => void;
  private pingInterval: number | null = null;

  constructor() {
    this.socket = io({
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.loadSavedSession();
    this.setupListeners();
    this.startPingMonitor();
  }

  private loadSavedSession(): void {
    try {
      this.roomCode = sessionStorage.getItem('coin_rush_room');
      this.playerId = sessionStorage.getItem('coin_rush_player');
      this.sessionToken = sessionStorage.getItem('coin_rush_token');
    } catch {
      // Ignore storage restrictions
    }
  }

  public saveSession(roomCode: string, playerId: string, sessionToken: string): void {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.sessionToken = sessionToken;
    try {
      sessionStorage.setItem('coin_rush_room', roomCode);
      sessionStorage.setItem('coin_rush_player', playerId);
      sessionStorage.setItem('coin_rush_token', sessionToken);
    } catch {
      // Ignore storage restrictions
    }
  }

  public clearSession(): void {
    this.roomCode = null;
    this.playerId = null;
    this.sessionToken = null;
    this.isHost = false;
    try {
      sessionStorage.removeItem('coin_rush_room');
      sessionStorage.removeItem('coin_rush_player');
      sessionStorage.removeItem('coin_rush_token');
    } catch {
      // Ignore storage restrictions
    }
  }

  private setupListeners(): void {
    this.socket.on('game_state', (snapshot: GameStateSnapshot) => {
      if (this.onStateCallback) {
        this.onStateCallback(snapshot);
      }
    });

    this.socket.on('game_event', (event: GameEvent) => {
      if (this.onEventCallback) {
        this.onEventCallback(event);
      }
    });

    this.socket.on('public_rooms_update', (rooms: PublicRoomInfo[]) => {
      if (this.onPublicRoomsCallback) {
        this.onPublicRoomsCallback(rooms);
      }
    });

    // Handle reconnect on connection drop
    this.socket.on('connect', () => {
      if (this.roomCode && this.sessionToken) {
        this.joinRoom(this.roomCode, '', (res) => {
          if (!res.success) {
            this.clearSession();
          }
        });
      }
    });
  }

  private startPingMonitor(): void {
    this.pingInterval = window.setInterval(() => {
      if (!this.socket.connected) return;
      const start = performance.now();
      this.socket.emit('ping_check', start, (clientTime: number) => {
        this.currentPing = Math.round(performance.now() - clientTime);
        if (this.onPingCallback) {
          this.onPingCallback(this.currentPing);
        }
      });
    }, 3000);
  }

  public createRoom(
    nickname: string,
    withBots: boolean,
    callback: (res: RoomResponse) => void
  ): void {
    this.socket.emit('create_room', { nickname, withBots }, (res: RoomResponse) => {
      if (res.success && res.roomCode && res.playerId && res.sessionToken) {
        this.saveSession(res.roomCode, res.playerId, res.sessionToken);
        this.isHost = Boolean(res.isHost);
      }
      callback(res);
    });
  }

  public joinRoom(
    roomCode: string,
    nickname: string,
    callback: (res: RoomResponse) => void
  ): void {
    this.socket.emit(
      'join_room',
      { roomCode, nickname, sessionToken: this.sessionToken || undefined },
      (res: RoomResponse) => {
        if (res.success && res.roomCode && res.playerId && res.sessionToken) {
          this.saveSession(res.roomCode, res.playerId, res.sessionToken);
          this.isHost = Boolean(res.isHost);
        }
        callback(res);
      }
    );
  }

  public addBot(): void {
    this.socket.emit('add_bot');
  }

  public setReady(ready: boolean): void {
    if (this.playerId) {
      this.socket.emit('set_ready', { playerId: this.playerId, ready });
    }
  }

  public startGame(): void {
    if (this.playerId) {
      this.socket.emit('start_game', { playerId: this.playerId });
    }
  }

  public sendMove(dir: { x: number; y: number }): void {
    if (this.playerId) {
      this.socket.emit('player_move', { playerId: this.playerId, dir });
    }
  }

  public requestRematch(): void {
    if (this.playerId) {
      this.socket.emit('request_rematch', { playerId: this.playerId });
    }
  }

  public leaveRoom(): void {
    if (this.playerId) {
      this.socket.emit('leave_room', { playerId: this.playerId });
      this.clearSession();
    }
  }

  public onState(callback: (state: GameStateSnapshot) => void): void {
    this.onStateCallback = callback;
  }

  public onEvent(callback: (event: GameEvent) => void): void {
    this.onEventCallback = callback;
  }

  public onPublicRooms(callback: (rooms: PublicRoomInfo[]) => void): void {
    this.onPublicRoomsCallback = callback;
  }

  public onPing(callback: (pingMs: number) => void): void {
    this.onPingCallback = callback;
  }
}
