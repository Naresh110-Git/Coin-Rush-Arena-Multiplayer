import { Server } from 'socket.io';
import { GameRoom } from './GameRoom.js';
import { PublicRoomInfo } from '../shared/types.js';
import { GAME_CONSTANTS } from '../shared/constants.js';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private socketRoomMap: Map<string, string> = new Map();

  constructor(private io: Server) {}

  public createRoom(): GameRoom {
    const code = this.generateRoomCode();
    const room = new GameRoom(code, this.io, (emptyCode) => {
      this.destroyRoom(emptyCode);
    });

    this.rooms.set(code, room);
    this.broadcastPublicRooms();
    return room;
  }

  public getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public registerSocketInRoom(socketId: string, roomCode: string): void {
    this.socketRoomMap.set(socketId, roomCode);
    this.broadcastPublicRooms();
  }

  public unregisterSocket(socketId: string): void {
    const roomCode = this.socketRoomMap.get(socketId);
    if (roomCode) {
      this.socketRoomMap.delete(socketId);
      const room = this.rooms.get(roomCode);
      if (room) {
        room.handleDisconnect(socketId);
      }
      this.broadcastPublicRooms();
    }
  }

  public getRoomBySocket(socketId: string): GameRoom | undefined {
    const roomCode = this.socketRoomMap.get(socketId);
    return roomCode ? this.rooms.get(roomCode) : undefined;
  }

  public destroyRoom(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      room.destroy();
      this.rooms.delete(code);
      // Clean socket mappings for this room
      for (const [sId, rCode] of this.socketRoomMap.entries()) {
        if (rCode === code) {
          this.socketRoomMap.delete(sId);
        }
      }
      this.broadcastPublicRooms();
    }
  }

  public getPublicRooms(): PublicRoomInfo[] {
    const list: PublicRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      // Show waiting or in-progress rooms in the open directory
      const host = Array.from(room.players.values()).find((p) => p.isHost);
      const connectedCount = Array.from(room.players.values()).filter((p) => p.connected).length;

      list.push({
        code: room.code,
        hostNickname: host?.nickname || 'Arena Host',
        playerCount: connectedCount,
        maxPlayers: GAME_CONSTANTS.MAX_PLAYERS,
        status: room.status,
        isSoloFriendly: true,
      });
    }

    // Sort: waiting rooms first, then by player count descending
    list.sort((a, b) => {
      if (a.status === 'WAITING' && b.status !== 'WAITING') return -1;
      if (b.status === 'WAITING' && a.status !== 'WAITING') return 1;
      return b.playerCount - a.playerCount;
    });

    return list;
  }

  public broadcastPublicRooms(): void {
    this.io.emit('public_rooms_update', this.getPublicRooms());
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    let attempts = 0;

    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      attempts++;
    } while (this.rooms.has(code) && attempts < 1000);

    return code;
  }
}
